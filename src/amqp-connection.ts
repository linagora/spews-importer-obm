import {logger} from "./logger";
import {URL} from "./types";

export class AmqpConnection {

    private connectionProvider;

    constructor(connectionProvider?) {
        this.connectionProvider = connectionProvider || require("rx-amqplib");
    }

    public create(host: URL) {
        let amqpConnection = this.connectionProvider.newConnection(host);
        process.on("SIGINT", () => amqpConnection.subscribe(conn => {
            logger.warn("Closing amqp connection..");
            conn.close();
            process.exit();
        }));
        return amqpConnection;
    }
}
