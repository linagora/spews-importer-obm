import {AmqpConnectionFactory, ImporterConfigFactory} from "../src/factories";
import {BatchOperationType} from "../src/papi-client";
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

    describe("ImporterConfigFactory", () => {

        describe("create function", () => {

            it("should return expected config if the 'options' is fulfilled", () => {
                let config = ImporterConfigFactory.create({
                    batch_size: 28,
                    batch_wait: 32,
                    batch_delay: 35,
                    batch_check_interval: 45,
                    amqp_host: "the host",
                    only_type: "EVENT",
                });
                expect(config).to.deep.equal({
                    maxBatchSize: 28,
                    maxBatchWaitTimeMs: 32,
                    delayBetweenBatchMs: 35,
                    checkBatchStatusInterval: 45,
                    amqp: {
                        host: "the host",
                        queues: {
                            event: "events",
                            contact: "contacts",
                        },
                    },
                    onlyType: BatchOperationType.EVENT,
                });
            });

            it("should trigger an error if the given 'only_type' is illegal", () => {
                let create = () => ImporterConfigFactory.create({ only_type: "doNotExists" });
                expect(create).to.throw(Error, "Illegal only_type option value: doNotExists");
            });

            it("should return undefined 'onlyType' if the given 'only_type' is undefined", () => {
                let config = ImporterConfigFactory.create({ only_type: undefined });
                expect(config.onlyType).to.be.undefined;
            });

        });

    });

});
