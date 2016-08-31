import {Importer, ImporterConfig} from "./importer";
import {logger} from "./logger";
import {PapiClient} from "./papi-client";
import {URL, UUID} from "./types";

export class ImporterFactory {

    public static create(papiUrl: URL, domainUuid: UUID, options): Importer {
        let config: ImporterConfig = {
            maxBatchSize: options.batch_size,
            maxBatchWaitTimeMs: options.batch_wait,
            delayBetweenBatchMs: options.batch_delay,
            amqp: {
                host: options.amqp_host,
                queues: {
                    event: "events",
                },
            },
        };

        let amqpConnection = AmqpConnectionFactory.create(config.amqp.host);

        let papiClient = new PapiClient(papiUrl, domainUuid, {
            login: options.papi_user,
            password: options.papi_pwd,
        });

        return new Importer(papiClient, config, amqpConnection);
    }
}

export class AmqpConnectionFactory {

    public static create(host: URL, connectionProvider?) {
        let provider = connectionProvider || require("rx-amqplib");
        let amqpConnection = provider.newConnection(host);
        process.on("SIGINT", () => amqpConnection.subscribe(conn => {
            logger.warn("Closing amqp connection..");
            conn.close();
            process.exit();
        }));
        return amqpConnection;
    }
}
