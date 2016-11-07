import {DateString, EmailAddress, ICS, UUID, VCF} from "./types";
import * as Promise from "bluebird";
import {Response} from "superagent";

export type ImportMethod = (ImportMessage) => Promise<Response>;

export interface ImportMessage {
    Id: UUID;
    CreationDate: DateString;
    PrimaryAddress: EmailAddress;
}

export interface EventMessage extends ImportMessage {
    CalendarId: string;
    AppointmentId: string;
    MimeContent: ICS;
}

export interface ContactMessage extends ImportMessage {
    AddressBookId: string;
    OriginalContactId: string;
    MimeContent: VCF;
}

export interface AddressBookMessage extends ImportMessage {
    AddressBookId: string;
    AddressBookType: string;
    DisplayName: string;
}

export class ImportingEntity {

    constructor(
        private importMethod: ImportMethod,
        private queueName: string,
        private amqpChannel,
        private amqpMessage
    ) {}

    public import(): Promise<Response> {
        return this.importMethod(JSON.parse(this.amqpMessage.content.toString()));
    }

    public importHasSucceed(): void {
        this.amqpMessage.ack();
    }

    public importHasFailed(): void {
        this.amqpMessage.nack(false);
        this.amqpChannel.sendToQueue(this.queueName, this.amqpMessage.content, this.amqpMessage.properties);
    }

}
