import * as winston from "winston";

export const logger: winston.LoggerInstance = new (winston.Logger)({
    level: process.env.LOG_LEVEL || "info",
    transports: [
        new (winston.transports.File)({
            filename: "log/import.log",
            json: false,
        }),
    ],
});
