import {AmqpConnection} from "../src/amqp-connection";
import {expect} from "chai";
import {Observable} from "rx";
import * as sinon from "sinon";

describe("AmqpConnection", () => {

    let amqpConnection: AmqpConnection;
    let connection;
    let connectionProvider;

    beforeEach(() => {
        connection = { close: sinon.spy() };
        connectionProvider =  sinon.stub().returns(Observable.just(connection));
        amqpConnection = new AmqpConnection({
            newConnection: connectionProvider,
        });
    });

    describe("create function", () => {

        it("should use the given host param", () => {
            let host = "expected host";

            amqpConnection.create(host);

            expect(connectionProvider.calledWith(host)).to.be.true;
        });

        it("should return the built connection observable", (done) => {
            amqpConnection.create("host").subscribe(conn => {
                expect(conn).to.deep.equal(connection);
                done();
            });
        });

    });

});
