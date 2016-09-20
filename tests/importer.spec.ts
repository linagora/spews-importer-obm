import {Importer, ImporterConfig} from "../src/importer";
import {BatchOperationStatus, BatchOperationType, BatchOperationVerb, PapiClient} from "../src/papi-client";
import * as Promise from "bluebird";
import {expect} from "chai";
import {Observable} from "rx";
import * as sinon from "sinon";

describe("Importer", () => {

    let config: ImporterConfig;
    let papiClient: PapiClient;

    let allEventMessages;
    let amqpConnectionProvider;
    let amqpConnection;
    let amqpChannel;

    beforeEach(() => {
        config = {
            maxBatchSize: 5,
            maxBatchWaitTimeMs: 5000,
            delayBetweenBatchMs: 1000,
            amqp: {
                host: "amqp://localhost",
                queues: {
                    event: "MIMEImporter",
                },
            },
        };

        allEventMessages = [{
            ack: sinon.spy(),
            nack: sinon.spy(),
            content: {
                toString: () => '{"Id":"the id1","CreationDate":"a date","PrimaryAddress":"an address","CalendarId":"the calendar","AppointmentId":"an appointment","MimeContent":"the mime"}',
            },
            properties: { amqpProperties: "message 1 property" },
        }, {
            ack: sinon.spy(),
            nack: sinon.spy(),
            content: {
                toString: () => '{"Id":"the id2","CreationDate":"a date","PrimaryAddress":"an address","CalendarId":"the calendar","AppointmentId":"an appointment","MimeContent":"the mime"}',
            },
            properties: { amqpProperties: "message 2 property" },
        }];

        amqpChannel = {
            assertQueue: sinon.spy(() => Observable.just({channel: amqpChannel})),
            prefetch: sinon.spy(),
            consume: sinon.stub().returns(Observable.create(observer => {
                allEventMessages.forEach(eventMessage => observer.onNext(eventMessage));
            })),
            sendToQueue: sinon.spy(),
        };
        amqpConnection = {createChannel: sinon.stub().returns(Observable.just(amqpChannel))};
        amqpConnectionProvider = Observable.just(amqpConnection);

        papiClient = new PapiClient("http://obm.org/", "my-domain", {login: "admin", password: "pwd"});
        papiClient.startBatch = sinon.stub().returns(Promise.resolve({}));
        papiClient.commitBatch = sinon.stub().returns(Promise.resolve({}));
        papiClient.waitForBatchSuccess = sinon.stub().returns(Promise.resolve({
            message: "ok",
            errors: [],
        }));
    });

    describe("importAllEvents function", () => {

        it("should create a channel from the amqp connection", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();

            expect(amqpConnection.createChannel.called).to.be.true;
        });

        it("should create the queue from the amqp channel with expected options", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();

            expect(amqpChannel.assertQueue.calledWithExactly(config.amqp.queues.event, { durable: true })).to.be.true;
        });

        it("should configure the channel's prefetch to 'maxBatchSize'", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();

            expect(amqpChannel.prefetch.calledWithExactly(config.maxBatchSize)).to.be.true;
        });

        it("should start a channel consumer with expected options", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();

            expect(amqpChannel.consume.calledWithExactly(config.amqp.queues.event, { noAck: false })).to.be.true;
        });

        it("should transform the amqp messages to the expected format", (done) => {
            config.maxBatchWaitTimeMs = 100;

            papiClient.importAllICS = (events) => {
                expect(events).to.deep.equal([{
                    Id: "the id1",
                    CreationDate: "a date",
                    PrimaryAddress: "an address",
                    CalendarId: "the calendar",
                    AppointmentId: "an appointment",
                    MimeContent: "the mime",
                }, {
                    Id: "the id2",
                    CreationDate: "a date",
                    PrimaryAddress: "an address",
                    CalendarId: "the calendar",
                    AppointmentId: "an appointment",
                    MimeContent: "the mime",
                }]);
                done();
                return Promise.resolve([]);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should not start any batch on papi if no amqp event message is received", (done) => {
            config.maxBatchWaitTimeMs = 100;
            allEventMessages = [];
            papiClient.startBatch = () => done("Should not be called");

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();

            setTimeout(done, config.maxBatchWaitTimeMs + 200);
        });

        it("should start a batch with less events than 'maxBatchSize' if 'runBatchWaitTime' is over", (done) => {
            config.maxBatchSize = allEventMessages.length + 1000;
            config.maxBatchWaitTimeMs = 100;

            papiClient.importAllICS = (events) => {
                expect(events.length).to.equal(allEventMessages.length);
                done();
                return Promise.resolve([]);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should start a batch as soon as 'maxBatchSize' event messages are received", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.maxBatchWaitTimeMs = 9999;

            papiClient.importAllICS = (events) => {
                expect(events.length).to.equal(config.maxBatchSize);
                done();
                return Promise.resolve([]);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should ack all amqp event messages when the batch is finished and has waited the 'delayBetweenBatchMs'", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.delayBetweenBatchMs = 100;
            papiClient.importAllICS = () => Promise.resolve([]);

            papiClient.waitForBatchSuccess = () => {

                // Wait more than the 'delayBetweenBatchMs' then assert that acks have been called
                setTimeout(() => {
                    allEventMessages.forEach(msg => expect(msg.ack.called).to.be.true);
                    done();
                }, config.delayBetweenBatchMs * 3);

                return Promise.resolve({
                    message: "success",
                    errors: [],
                });
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should requeue all amqp messages when the batch is finished with at least one error", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.delayBetweenBatchMs = 100;
            papiClient.importAllICS = () => Promise.resolve([]);

            papiClient.waitForBatchSuccess = () => {

                // Wait more than the 'delayBetweenBatchMs' then assert that acks have been called
                setTimeout(() => {
                    allEventMessages.forEach(msg => {
                        expect(amqpChannel.sendToQueue.calledWith(config.amqp.queues.event, msg.content, msg.properties)).to.be.true;
                        expect(msg.nack.calledWith(false)).to.be.true;
                    });
                    done();
                }, config.delayBetweenBatchMs * 3);

                return Promise.resolve({
                    message: "success",
                    errors: [{
                        status: BatchOperationStatus.ERROR,
                        entityType: BatchOperationType.EVENT,
                        entity: "the given ICS",
                        operation: BatchOperationVerb.POST,
                        error: "the error message",
                    }],
                });
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should make multiple batches is more event messages than 'maxBatchSize' are available", (done) => {
            config.maxBatchSize = 1;
            config.maxBatchWaitTimeMs = 9999;
            papiClient.importAllICS = () => Promise.resolve([]);

            let batchCount = 0;
            papiClient.commitBatch = () => {
                batchCount++;
                if (batchCount === allEventMessages.length) {
                    done();
                }
                return Promise.resolve(undefined);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

        it("should execute papi calls in the expected order", (done) => {

            let startBatchSpy = sinon.spy(() => {
                expect(importAllICSSpy.called).to.be.false;
                expect(commitBatchSpy.called).to.be.false;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve(undefined);
            });

            let importAllICSSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(commitBatchSpy.called).to.be.false;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve([]);
            });

            let commitBatchSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(importAllICSSpy.called).to.be.true;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve(undefined);
            });

            let waitForBatchSuccessSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(importAllICSSpy.called).to.be.true;
                expect(commitBatchSpy.called).to.be.true;
                done();
                return Promise.resolve({
                    message: "success",
                    errors: [],
                });
            });

            config.maxBatchSize = 2;
            papiClient.startBatch = startBatchSpy;
            papiClient.importAllICS = importAllICSSpy;
            papiClient.commitBatch = commitBatchSpy;
            papiClient.waitForBatchSuccess = waitForBatchSuccessSpy;

            new Importer(papiClient, config, amqpConnectionProvider).importAllEvents();
        });

    });

});
