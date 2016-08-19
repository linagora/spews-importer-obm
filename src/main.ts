import {ImporterFactory} from "./factories";
import * as program from "commander";

program.version("0.0.1");

program.command("import <papiUrl> <domainUuid>")
    .description("Listen to the message-queue to import data in an OBM instance")
    .option("-u, --papi_user <user>", "The PAPI user login [admin0@global.virt]", "admin0@global.virt")
    .option("-p, --papi_pwd <password>", "The PAPI user password [admin]", "admin")
    .option("-h, --amqp_host <host>", "The AMQP server address [amqp://localhost]", "amqp://localhost")
    .option("-s, --batch_size <size>", "Maximum item (e.g. event) count in one batch [5]", 5)
    .option("-w, --batch_wait <wait>", "Time to wait (in ms) for new message from the message-queue before making a batch [5000]", 5000)
    .option("-d, --batch_delay <delay>", "Minimal time (in ms) to wait between two batches, can be used to avoid PAPI overload [1000]", 1000)
    .action((papiUrl, domainUuid, options) => {
        ImporterFactory.create(papiUrl, domainUuid, options).importAllEvents();
    });

function outputHelpIfNoCommand() {
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

program.parse(process.argv);
outputHelpIfNoCommand();
