import {batchErrorLogger, logger} from "./logger";
import {EventMessage} from "./models";
import {BatchResult, PapiClient} from "./papi-client";
import {URL} from "./types";
import * as Promise from "bluebird";

export interface AmqpQueues {
    event: string;
}

export interface AmqpConfig {
    host: URL;
    queues: AmqpQueues;
}

export interface ImporterConfig {
    amqp: AmqpConfig;
    maxBatchSize: number;
    maxBatchWaitTimeMs: number;
    delayBetweenBatchMs: number;
}

export class Importer {

    constructor(
        private papiClient: PapiClient,
        private config: ImporterConfig,
        private amqpConnectionProvider
    ) {}

    public importAllEvents(): void {
        let runCount = 0;
        let amqpChannel;
        this.amqpConnectionProvider
            .flatMap(connection => connection.createChannel())
            .flatMap(channel => channel.assertQueue(this.config.amqp.queues.event, { durable: true }))
            .flatMap(reply => {
                amqpChannel = reply.channel;
                reply.channel.prefetch(this.config.maxBatchSize);
                return reply.channel.consume(this.config.amqp.queues.event, { noAck: false });
            })
            .bufferWithTimeOrCount(this.config.maxBatchWaitTimeMs, this.config.maxBatchSize)
            .subscribe(amqpMessages => this.runBatchThenAck(runCount, amqpChannel, amqpMessages));
    }

    private runBatchThenAck(runCount: number, amqpChannel, amqpMessages) {
        if (amqpMessages.length === 0) {
            logger.info("Empty buffer, skipping it");
            return;
        }

        runCount++;
        logger.info("Batch %d has %d events", runCount, amqpMessages.length);
        this.runBatchOnPapi(amqpMessages).then(batchResult => {
            logger.info("Batch %d is done: ", runCount, batchResult.message);
            batchResult.errors.forEach(e => batchErrorLogger.error("Batch #%d", runCount, e));
            setTimeout(() => this.ackOrRequeueAllIfAnyError(batchResult, amqpChannel, amqpMessages), this.config.delayBetweenBatchMs);
        });
    }

    private ackOrRequeueAllIfAnyError(batchResult, amqpChannel, amqpMessages) {
        // We are not able to know which items are in error so we requeue all.
        // As the import operations are idempotent, process again well imported item won't have any effect.
        if (batchResult.errors.length === 0) {
            amqpMessages.forEach(e => e.ack());
        } else {
            amqpMessages.forEach(e => amqpChannel.sendToQueue(this.config.amqp.queues.event, e.content, e.properties));
            amqpMessages.forEach(e => e.nack(false));
        }
    };

    private messagesToPapiEvents(events): EventMessage[] {
        return events.map(event => {
            let content = JSON.parse(event.content.toString());
            logger.debug("Got message %s created at %s", content.Id, content.CreationDate);
            return content;
        });
    }

    private runBatchOnPapi(events): Promise<BatchResult> {
        logger.info("Starting a batch");
        return this.papiClient.startBatch().then(() => {
            return this.papiClient.importAllICS(this.messagesToPapiEvents(events))
                .then(() => {
                    logger.info("Commiting a batch");
                    return this.papiClient.commitBatch();
                })
                .then(() => {
                    logger.info("Waiting for batch to finish");
                    return this.papiClient.waitForBatchSuccess();
                });
        });
    }

}
