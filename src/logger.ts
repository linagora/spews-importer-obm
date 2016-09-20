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

export const batchErrorLogger: winston.LoggerInstance = new (winston.Logger)({
    level: "info",
    transports: [
        new (winston.transports.File)({
            filename: "log/errors.log",
            json: true,
            showLevel: false,
        }),
    ],
});

export const consoleLogger: winston.LoggerInstance = new (winston.Logger)({
    level: "debug",
    transports: [
        new (winston.transports.Console)({
            json: false,
            showLevel: false,
        }),
    ],
});
