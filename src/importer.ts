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
        this.amqpConnectionProvider
            .flatMap(connection => connection.createChannel())
            .flatMap(channel => channel.assertQueue(this.config.amqp.queues.event, { durable: true }))
            .flatMap(reply => {
                reply.channel.prefetch(this.config.maxBatchSize);
                return reply.channel.consume(this.config.amqp.queues.event, { noAck: false });
            })
            .bufferWithTimeOrCount(this.config.maxBatchWaitTimeMs, this.config.maxBatchSize)
            .subscribe(this.runBatchThenAck.bind(this, runCount));
    }

    private runBatchThenAck(runCount: number, events) {
        if (events.length === 0) {
            logger.info("Empty buffer, skipping it");
            return;
        }

        runCount++;
        logger.info("Cycle %d has %d events", runCount, events.length);
        this.runBatchOnPapi(events)
            .then(batchResult => {
                logger.info("Batch %d is done: ", runCount, batchResult.message);
                batchResult.errors.forEach(e => batchErrorLogger.error("Batch #%d", runCount, e));
            })
            .then(() => {
                setTimeout(() => events.forEach(e => e.ack()), this.config.delayBetweenBatchMs);
            });
    }

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
