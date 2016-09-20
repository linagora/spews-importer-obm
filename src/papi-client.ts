import {EventMessage} from "./models";
import {URL, UUID} from "./types";
import * as Promise from "bluebird";
import {get, post, put, Response, SuperAgentRequest} from "superagent";

export type RequestBuilder = (url: string, callback?: (err: any, res: Response) => void) => SuperAgentRequest;
export type BatchId = number;

export interface PapiCredentials {
    login: string;
    password: string;
}

export enum BatchOperationStatus {ERROR, SUCCESS, IDLE, RUNNING}
export enum BatchOperationType {GROUP, USER, GROUP_MEMBERSHIP, USER_MEMBERSHIP, EVENT, CONTACT}
export enum BatchOperationVerb {GET, POST, PUT, DELETE, PATCH}

export interface BatchResult {
    message: string;
    errors: BatchError[];
}

export interface BatchError {
    status: BatchOperationStatus;
    entityType: BatchOperationType;
    entity: string;
    operation: BatchOperationVerb;
    error: string;
}

const DEFAUT_DELAY_MS = 1000;

export class PapiClient {

    public currentBatchId: BatchId;

    constructor(
        private apiUrl: URL,
        private domainUUID: UUID,
        private credentials: PapiCredentials
    ) {}

    public startBatch(): Promise<Response> {
        if (this.currentBatchId) {
            throw new Error("The following batch is already started: " + this.currentBatchId);
        }

        return this.promisify(this.request(post, "/batches/")).then(res => {
            this.currentBatchId = res.body.id;
            return res;
        });
    }

    public commitBatch(): Promise<Response> {
        this.assertBatchHasBeenStarted();

        return this.promisify(this.requestInBatch(put, "/"));
    }

    public waitForBatchSuccess(delay?: number): Promise<BatchResult> {
        this.assertBatchHasBeenStarted();

        let deferred = Promise.defer<BatchResult>();
        let callback = (err, res) => {
            if (err) {
                deferred.reject(err);
            } else if (res.body.status === BatchOperationStatus[BatchOperationStatus.ERROR]) {
                deferred.reject("ERROR: " + res.body.operationDone + "/" + res.body.operationCount);
            } else if (res.body.status === BatchOperationStatus[BatchOperationStatus.SUCCESS]) {
                this.currentBatchId = undefined;
                deferred.resolve({
                    message: "SUCCESS: " + res.body.operationDone + "/" + res.body.operationCount,
                    errors: this.findBatchErrors(res.body),
                });
            } else {
                setTimeout(lookForStatus, delay || DEFAUT_DELAY_MS);
            }
        };
        let lookForStatus = () => this.requestInBatch(get, "/").end(callback);
        lookForStatus();

        return deferred.promise;
    }

    public importICS(event: EventMessage): Promise<Response> {
        this.assertBatchHasBeenStarted();

        return this.promisify(this.requestInBatch(post, "/events/" + event.PrimaryAddress)
            .type("text/plain")
            .send(event.MimeContent)
        );
    }

    public importAllICS(events: EventMessage[]): Promise<Response[]> {
        return Promise.all(events.map(e => this.importICS(e)));
    }

    private findBatchErrors(batch): BatchError[] {
        return batch.operations.filter(o => o.error || o.status === BatchOperationStatus[BatchOperationStatus.ERROR]);
    }

    private promisify(request: SuperAgentRequest): Promise<Response> {
        return Promise.fromCallback(callback => request.end(callback));
    }

    private requestInBatch(request: RequestBuilder, url: string): SuperAgentRequest {
        return this.request(request, "/batches/" + this.currentBatchId + url);
    }

    private request(request: RequestBuilder, url: string): SuperAgentRequest {
        return this.auth(request(this.papiUrl(url)));
    }

    private auth(request) {
        return request.auth(this.credentials.login, this.credentials.password);
    }

    private papiUrl(urlSuffix: string): string {
        return this.apiUrl + this.domainUUID + urlSuffix;
    }

    private assertBatchHasBeenStarted() {
        if (!this.currentBatchId) {
            throw new Error("No batch has been started");
        }
    }
}
