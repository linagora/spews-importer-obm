import {batchErrorLogger, logger} from "./logger";
import {ImportingEntity, ImportMethod} from "./models";
import {BatchOperationType, BatchResult, PapiClient} from "./papi-client";
import {URL} from "./types";
import * as Promise from "bluebird";
import {Observable} from "rx";

export interface AmqpQueues {
    event: string;
    contact: string;
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
    onlyType?: BatchOperationType;
}

export class Importer {

    private batchNumber: number = 0;

    constructor(
        private papiClient: PapiClient,
        private config: ImporterConfig,
        private amqpConnectionProvider
    ) {}

    public importAll(): void {
        this.amqpConnectionProvider
            .flatMap(connection => connection.createChannel())
            .flatMap(channel => Observable.merge(
                channel.assertQueue(this.config.amqp.queues.event, { durable: true }),
                channel.assertQueue(this.config.amqp.queues.contact, { durable: true })
            ).takeLast(1))
            .flatMap(reply => {
                reply.channel.prefetch(this.config.maxBatchSize, true);
                return Observable.merge(this.buildConsumers(reply.channel));
            })
            .bufferWithTimeOrCount(this.config.maxBatchWaitTimeMs, this.config.maxBatchSize)
            .subscribe(entities => this.importInOBM(entities));
    }

    private buildConsumers(amqpChannel): Observable<ImportingEntity>[] {
        if (!this.config.onlyType) {
            logger.info("The import will consume messages of all entity types");
            return [this.buildEventConsumer(amqpChannel), this.buildContactConsumer(amqpChannel)];
        }

        switch (this.config.onlyType) {
            case BatchOperationType.EVENT:
                logger.info("The import will consume messages of EVENT type only");
                return [this.buildEventConsumer(amqpChannel)];
            case BatchOperationType.CONTACT:
                logger.info("The import will consume messages of CONTACT type only");
                return [this.buildContactConsumer(amqpChannel)];
            default:
                throw new Error("Invalid type: " + this.config.onlyType + " " +  BatchOperationType.EVENT);
        }
    }

    private buildEventConsumer(amqpChannel): Observable<ImportingEntity> {
        return this.buildConsumer(amqpChannel, this.config.amqp.queues.event, this.papiClient.importICS.bind(this.papiClient));
    }

    private buildContactConsumer(amqpChannel): Observable<ImportingEntity> {
        return this.buildConsumer(amqpChannel, this.config.amqp.queues.contact, this.papiClient.importVCF.bind(this.papiClient));
    }

    private buildConsumer(amqpChannel, queue: string, importMethod: ImportMethod): Observable<ImportingEntity> {
        return amqpChannel
            .consume(queue, { noAck: false })
            .map(msg => new ImportingEntity(importMethod, queue, amqpChannel, msg));
    }

    private importInOBM(entities: ImportingEntity[]) {
        if (entities.length === 0) {
            logger.info("Empty buffer, skipping it");
            return;
        }

        this.batchNumber++;
        logger.info("Batch %d has %d messages", this.batchNumber, entities.length);
        this.runBatchOnPapi(entities).then(batchResult => {
            logger.info("Batch %d is done: ", this.batchNumber, batchResult.message);
            batchResult.errors.forEach(e => batchErrorLogger.error("Batch #%d", this.batchNumber, e));
            setTimeout(() => this.notifyEntityStateDependingOnBatchStatus(batchResult, entities), this.config.delayBetweenBatchMs);
        });
    }

    private notifyEntityStateDependingOnBatchStatus(batchResult, entities: ImportingEntity[]) {
        // We are not able to know which entities are in error so we mark all as failed if required.
        // As the import operations are idempotent, process again well imported item won't have any effect.
        if (batchResult.errors.length === 0) {
            entities.forEach(e => e.importHasSucceed());
        } else {
            entities.forEach(e => e.importHasFailed());
        }
    }

    private runBatchOnPapi(entities: ImportingEntity[]): Promise<BatchResult> {
        logger.info("Starting a batch");
        return this.papiClient.startBatch().then(() => {
            return Promise.all(entities.map(e => e.import()))
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
