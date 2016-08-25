import {DateString, EmailAddress, ICS, UUID} from "./types";

export interface EventMessage {
    Id: UUID;
    CreationDate: DateString;
    PrimaryAddress: EmailAddress;
    CalendarId: string;
    AppointmentId: string;
    MimeContent: ICS;
}
