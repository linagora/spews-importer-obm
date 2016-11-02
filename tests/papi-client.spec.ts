import {ContactMessage, EventMessage} from "../src/models";
import {PapiClient} from "../src/papi-client";
import {expect} from "chai";
import superagent = require("superagent");

let mock = require("superagent-mocker")(superagent);

function expectBatchStart() {
    mock.post("http://obm.org/my-domain/batches/", () => {
        return {body: {id: 123}};
    });
}

function generateEvent(id?: number): EventMessage {
    id = id || 1;
    return {
        Id: "the id " + id,
        CreationDate: "2016-07-01T15:11:04",
        PrimaryAddress: "user@obm.org",
        CalendarId: "calendarId" + id,
        AppointmentId: "appointmentId" + id,
        MimeContent: "ICS data" + id,
    };
}

function generateContact(id?: number): ContactMessage {
    id = id || 1;
    return {
        Id: "the id " + id,
        CreationDate: "2016-07-02T15:11:04",
        PrimaryAddress: "user@obm.org",
        AddressBookId: "AddressbookId" + id,
        OriginalContactId: "OriginalContactId" + id,
        MimeContent: "VCF data" + id,
    };
}

describe("PapiClient", () => {

    let papiClient: PapiClient;

    beforeEach(() => {
        papiClient = new PapiClient("http://obm.org/", "my-domain", {
            login: "admin",
            password: "pwd",
        });
        mock.clearRoutes();
    });

    describe("startBatch function", () => {

        it("should set the authorization header", (done) => {
            mock.post("http://obm.org/my-domain/batches/", (req) => {
                expect(req.headers.authorization).to.equal("Basic YWRtaW46cHdk");
                done();
                return {body: {id: 123}};
            });

            papiClient.startBatch();
        });

        it("should make the created batch id available when done", (done) => {
            expectBatchStart();

            papiClient.startBatch()
                .then(() => expect(papiClient.currentBatchId).to.equal(123))
                .then(() => done(), done);
        });

        it("should refuse to create a new batch when one has already been started", (done) => {
            expectBatchStart();

            papiClient.startBatch()
                .then(() => expect(() => papiClient.startBatch()).to.throw(Error, "The following batch is already started: 123"))
                .then(() => done(), done);
        });

    });

    describe("commitBatch function", () => {

        it("should refuse to execute when no batch is started", () => {
            expect(() => papiClient.commitBatch()).to.throw(Error, "No batch has been started");
        });

        it("should set the authorization header", (done) => {
            expectBatchStart();
            mock.put("http://obm.org/my-domain/batches/123/", (req) => {
                expect(req.headers.authorization).to.equal("Basic YWRtaW46cHdk");
                done();
            });

            papiClient.startBatch().then(papiClient.commitBatch.bind(papiClient));
        });

        it("should sent PUT request for the started batch", (done) => {
            expectBatchStart();
            mock.put("http://obm.org/my-domain/batches/123/", () => {
                done();
            });

            papiClient.startBatch().then(papiClient.commitBatch.bind(papiClient));
        });

    });

    describe("waitForBatchSuccess function", () => {

        it("should refuse to execute when no batch is started", () => {
            expect(() => papiClient.waitForBatchSuccess()).to.throw(Error, "No batch has been started");
        });

        it("should set the authorization header", () => {
            expectBatchStart();
            mock.get("http://obm.org/my-domain/batches/123/", (req) => {
                expect(req.headers.authorization).to.equal("Basic YWRtaW46cHdk");
                return {body: {}};
            });

            papiClient.startBatch().then(papiClient.waitForBatchSuccess.bind(papiClient));
        });

        it("should reject the promise if the request is in error", (done) => {
            expectBatchStart();
            mock.get("http://obm.org/my-domain/batches/123/", () => {
                return {status: 500};
            });

            papiClient.startBatch()
                .then(papiClient.waitForBatchSuccess.bind(papiClient))
                .catch((err) => {
                    expect(err.status).to.equal(500);
                    done();
                });
        });

        it("should reject the promise when the status is ERROR", (done) => {
            expectBatchStart();
            mock.get("http://obm.org/my-domain/batches/123/", () => {
                return {body: {status: "ERROR", operationDone: 2, operationCount: 5}};
            });

            papiClient.startBatch()
                .then(papiClient.waitForBatchSuccess.bind(papiClient))
                .catch((err) => {
                    expect(err).to.equal("ERROR: 2/5");
                    done();
                });
        });

        it("should resolve the promise when the status is SUCCESS", (done) => {
            expectBatchStart();
            mock.get("http://obm.org/my-domain/batches/123/", () => {
                return {body: {status: "SUCCESS", operationCount: 5, operationDone: 5, operations: []}};
            });

            papiClient.startBatch()
                .then(papiClient.waitForBatchSuccess.bind(papiClient))
                .then(
                    res => {
                        expect(res).to.deep.equal({
                            message: "SUCCESS: 5/5",
                            errors: [],
                        });
                        expect(papiClient.currentBatchId).to.be.undefined;
                        done();
                    },
                    done
                );
        });

        it("should resolve a successful batch with a message and batch's errors", (done) => {
            let success = {
                status: "SUCCESS",
                entityType: "EVENT",
                entity: "SUCCESS ICS",
                operation: "POST",
                error: null,
            };
            let error = {
                status: "ERROR",
                entityType: "EVENT",
                entity: "ERROR ICS",
                operation: "POST",
                error: "org.obm.provisioning.exception.ProcessingException",
            };
            let errorButNoMessage = {
                status: "ERROR",
                entityType: "EVENT",
                entity: "ERROR ICS",
                operation: "POST",
                error: null,
            };
            let unknownWithErrorMessage = {
                status: "unknown status",
                entityType: "EVENT",
                entity: "SUCCESS but with error message ICS",
                operation: "POST",
                error: "has unknown status but also an error message",
            };

            expectBatchStart();
            mock.get("http://obm.org/my-domain/batches/123/", () => {
                return { body: {
                    status: "SUCCESS",
                    operationCount: 5,
                    operationDone: 3,
                    operations: [error, success, errorButNoMessage, unknownWithErrorMessage],
                }};
            });

            papiClient.startBatch()
                .then(papiClient.waitForBatchSuccess.bind(papiClient))
                .then(
                    res => {
                        expect(res).to.deep.equal({
                            message: "SUCCESS: 3/5",
                            errors: [error, errorButNoMessage, unknownWithErrorMessage],
                        });
                        done();
                    },
                    done
                );
        });

        it("should retry as long as the batch is not done", (done) => {
            expectBatchStart();

            let queryCount = 0;
            mock.get("http://obm.org/my-domain/batches/123/", (): any => {
                queryCount++;
                if (queryCount === 3) {
                    return {body: {status: "SUCCESS", operationCount: 5, operationDone: 5, operations: []}};
                }
                return {body: {status: "RUNNING"}};
            });

            papiClient.startBatch()
                .then(papiClient.waitForBatchSuccess.bind(papiClient, 10))
                .then(
                    () => {
                        expect(queryCount).to.equal(3);
                        done();
                    },
                    done
                );
        });

    });

    describe("importICS function", () => {

        it("should refuse to execute when no batch is started", () => {
            expect(() => papiClient.importICS(generateEvent())).to.throw(Error, "No batch has been started");
        });

        it("should set the authorization header", (done) => {
            expectBatchStart();
            mock.post("http://obm.org/my-domain/batches/123/events/user@obm.org", (req) => {
                expect(req.headers.authorization).to.equal("Basic YWRtaW46cHdk");
                done();
            });

            papiClient.startBatch().then(papiClient.importICS.bind(papiClient, generateEvent()));
        });

        it("should set the ICS data in the body and the text/plain header", (done) => {
            let event = generateEvent();
            expectBatchStart();
            mock.post("http://obm.org/my-domain/batches/123/events/user@obm.org", (req) => {
                expect(req.headers["content-type"]).to.equal("text/plain");
                expect(req.body).to.equal(event.MimeContent);
                done();
            });

            papiClient.startBatch().then(papiClient.importICS.bind(papiClient, event));
        });

    });

    describe("importVCF function", () => {

        it("should refuse to execute when no batch is started", () => {
            expect(() => papiClient.importVCF(generateContact())).to.throw(Error, "No batch has been started");
        });

        it("should set the authorization header", (done) => {
            expectBatchStart();
            mock.post("http://obm.org/my-domain/batches/123/contacts/user@obm.org", (req) => {
                expect(req.headers.authorization).to.equal("Basic YWRtaW46cHdk");
                done();
            });

            papiClient.startBatch().then(papiClient.importVCF.bind(papiClient, generateContact()));
        });

        it("should set the VCF data in the body and the text/plain header", (done) => {
            let contact = generateContact();
            expectBatchStart();
            mock.post("http://obm.org/my-domain/batches/123/contacts/user@obm.org", (req) => {
                expect(req.headers["content-type"]).to.equal("text/plain");
                expect(req.body).to.equal(contact.MimeContent);
                expect(req.query).to.deep.equal({ trackingRef: contact.Id, trackingDate: contact.CreationDate });
                done();
            });

            papiClient.startBatch().then(papiClient.importVCF.bind(papiClient, contact));
        });

    });

});
