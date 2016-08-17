export class AmqpConnection {

    private connectionProvider;

    constructor(connectionProvider?) {
        this.connectionProvider = connectionProvider || require("rx-amqplib");
    }

    public create(host: string) {
        let amqpConnection = this.connectionProvider.newConnection(host);
        process.on("SIGINT", () => amqpConnection.subscribe(conn => {
            console.warn("Closing amqp connection..");
            conn.close();
            process.exit();
        }));
        return amqpConnection;
    }
}
