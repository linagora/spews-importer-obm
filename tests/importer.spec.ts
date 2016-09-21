import {Importer, ImporterConfig} from "../src/importer";
import {BatchOperationStatus, BatchOperationType, BatchOperationVerb, PapiClient} from "../src/papi-client";
import * as Promise from "bluebird";
import {expect} from "chai";
import {Observable} from "rx";
import * as sinon from "sinon";

describe("Importer", () => {

    let config: ImporterConfig;
    let papiClient: PapiClient;
    let importICSSpy;
    let importVCFSpy;

    let allEventMessages;
    let allContactMessages;
    let amqpConnectionProvider;
    let amqpConnection;
    let amqpChannel;

    function buildAmqpMessage(id) {
        return {
            ack: sinon.spy(),
            nack: sinon.spy(),
            content: {},
            properties: { amqpProperties: `message ${id} property` },
        };
    }

    function buildEventMessage(id) {
        let message = buildAmqpMessage(id);
        message.content.toString = () => `{"Id":"the id ${id}","CreationDate":"a date","PrimaryAddress":"an address","CalendarId":"the calendar","AppointmentId":"an appointment","MimeContent":"the mime"}`;
        return message;
    }

    function buildContactMessage(id) {
        let message = buildAmqpMessage(id);
        message.content.toString = () => `{"Id":"the id ${id}","CreationDate":"a date","PrimaryAddress":"an address","AddressBookId":"the book","OriginalContactId":"a contact","MimeContent":"the mime"}`;
        return message;
    }

    beforeEach(() => {
        config = {
            maxBatchSize: 5,
            maxBatchWaitTimeMs: 5000,
            delayBetweenBatchMs: 1000,
            amqp: {
                host: "amqp://localhost",
                queues: {
                    event: "event_queue",
                    contact: "contact_queue",
                },
            },
        };

        allEventMessages = [buildEventMessage(1), buildEventMessage(2)];
        allContactMessages = [];

        amqpChannel = {
            assertQueue: sinon.spy(() => Observable.just({channel: amqpChannel})),
            prefetch: sinon.spy(),
            consume: sinon.spy(queueName => Observable.create(observer => {
                if (queueName === config.amqp.queues.event) {
                    allEventMessages.forEach(msg => observer.onNext(msg));
                } else if (queueName === config.amqp.queues.contact) {
                    allContactMessages.forEach(msg => observer.onNext(msg));
                }
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
        papiClient.importICS = importICSSpy = sinon.stub().returns(Promise.resolve(null));
        papiClient.importVCF = importVCFSpy = sinon.stub().returns(Promise.resolve(null));
    });

    describe("importAll function", () => {

        it("should create a channel from the amqp connection", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            expect(amqpConnection.createChannel.called).to.be.true;
        });

        it("should create the queue from the amqp channel with expected options", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            expect(amqpChannel.assertQueue.calledWithExactly(config.amqp.queues.event, { durable: true })).to.be.true;
        });

        it("should configure the channel's prefetch to 'maxBatchSize'", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            expect(amqpChannel.prefetch.calledWithExactly(config.maxBatchSize, true)).to.be.true;
        });

        it("should start a channel consumer with expected options only once", () => {
            allEventMessages = [];

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            expect(amqpChannel.consume.withArgs(config.amqp.queues.event, { noAck: false }).calledOnce).to.be.true;
            expect(amqpChannel.consume.withArgs(config.amqp.queues.contact, { noAck: false }).calledOnce).to.be.true;
        });

        it("should start a channel consumer on the only queue related to the config's 'onlyType'", () => {
            config.onlyType = BatchOperationType.CONTACT;

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            expect(amqpChannel.consume.withArgs(config.amqp.queues.event, { noAck: false }).called).to.be.false;
            expect(amqpChannel.consume.withArgs(config.amqp.queues.contact, { noAck: false }).calledOnce).to.be.true;
        });

        it("should transform the amqp messages format then call expected papiClient methods", (done) => {
            config.maxBatchWaitTimeMs = 100;

            allContactMessages = [buildContactMessage(3)];
            let expectedEvent1 = {
                Id: "the id 1",
                CreationDate: "a date",
                PrimaryAddress: "an address",
                CalendarId: "the calendar",
                AppointmentId: "an appointment",
                MimeContent: "the mime",
            };
            let expectedEvent2 = {
                Id: "the id 2",
                CreationDate: "a date",
                PrimaryAddress: "an address",
                CalendarId: "the calendar",
                AppointmentId: "an appointment",
                MimeContent: "the mime",
            };
            let expectedContact = {
                Id: "the id 3",
                CreationDate: "a date",
                PrimaryAddress: "an address",
                AddressBookId: "the book",
                OriginalContactId: "a contact",
                MimeContent: "the mime",
            };

            papiClient.commitBatch = () => {
                expect(importICSSpy.withArgs(expectedEvent1).calledOnce).to.be.true;
                expect(importICSSpy.withArgs(expectedEvent2).calledOnce).to.be.true;
                expect(importVCFSpy.withArgs(expectedContact).calledOnce).to.be.true;
                done();
                return Promise.resolve(null);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should not start any batch on papi if no amqp event message is received", (done) => {
            config.maxBatchWaitTimeMs = 100;
            allEventMessages = [];
            papiClient.startBatch = () => done("Should not be called");

            new Importer(papiClient, config, amqpConnectionProvider).importAll();

            setTimeout(done, config.maxBatchWaitTimeMs + 200);
        });

        it("should start a batch with less events than 'maxBatchSize' if 'runBatchWaitTime' is over", (done) => {
            config.maxBatchSize = allEventMessages.length + 1000;
            config.maxBatchWaitTimeMs = 100;

            papiClient.commitBatch = () => {
                expect(importICSSpy.callCount).to.equal(allEventMessages.length);
                done();
                return Promise.resolve(null);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should start a batch as soon as 'maxBatchSize' event messages are received", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.maxBatchWaitTimeMs = 9999;

            papiClient.commitBatch = () => {
                expect(importICSSpy.callCount).to.equal(allEventMessages.length);
                done();
                return Promise.resolve(null);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should ack all amqp event messages when the batch is finished and has waited the 'delayBetweenBatchMs'", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.delayBetweenBatchMs = 100;

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

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should requeue all amqp messages when the batch is finished with at least one error", (done) => {
            config.maxBatchSize = allEventMessages.length;
            config.delayBetweenBatchMs = 100;

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

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should make multiple batches is more event messages than 'maxBatchSize' are available", (done) => {
            config.maxBatchSize = 1;
            config.maxBatchWaitTimeMs = 9999;

            let batchCount = 0;
            papiClient.commitBatch = () => {
                batchCount++;
                if (batchCount === allEventMessages.length) {
                    done();
                }
                return Promise.resolve(undefined);
            };

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

        it("should execute papi calls in the expected order", (done) => {

            let startBatchSpy = sinon.spy(() => {
                expect(importSpy.called).to.be.false;
                expect(commitBatchSpy.called).to.be.false;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve(undefined);
            });

            let importSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(commitBatchSpy.called).to.be.false;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve([]);
            });

            let commitBatchSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(importSpy.called).to.be.true;
                expect(waitForBatchSuccessSpy.called).to.be.false;
                return Promise.resolve(undefined);
            });

            let waitForBatchSuccessSpy = sinon.spy(() => {
                expect(startBatchSpy.called).to.be.true;
                expect(importSpy.called).to.be.true;
                expect(commitBatchSpy.called).to.be.true;
                done();
                return Promise.resolve({
                    message: "success",
                    errors: [],
                });
            });

            config.maxBatchSize = 2;
            papiClient.startBatch = startBatchSpy;
            papiClient.importICS = importSpy;
            papiClient.commitBatch = commitBatchSpy;
            papiClient.waitForBatchSuccess = waitForBatchSuccessSpy;

            new Importer(papiClient, config, amqpConnectionProvider).importAll();
        });

    });

});
