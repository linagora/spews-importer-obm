import {AmqpConnectionFactory} from "../src/factories";
import {expect} from "chai";
import {Observable} from "rx";
import * as sinon from "sinon";

describe("The factories module", () => {

    describe("AmqpConnectionFactory", () => {

        let connection;
        let connectionProvider;

        beforeEach(() => {
            connection = {close: sinon.spy()};
            connectionProvider = {
                newConnection: sinon.stub().returns(Observable.just(connection)),
            };
        });

        describe("create function", () => {

            it("should use the given host param", () => {
                let host = "expected host";

                AmqpConnectionFactory.create(host, connectionProvider);

                expect(connectionProvider.newConnection.calledWith(host)).to.be.true;
            });

            it("should return the built connection observable", (done) => {
                AmqpConnectionFactory.create("host", connectionProvider).subscribe(conn => {
                    expect(conn).to.deep.equal(connection);
                    done();
                });
            });

        });

    });

});
