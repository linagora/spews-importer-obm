import {AmqpConnectionFactory, ImporterFactory} from "./factories";
import {consoleLogger} from "./logger";
import * as program from "commander";

program.version("0.0.1");

program.command("test-amqp-connection")
    .description("Verify that the tool is able to reach the amqp server")
    .option("-h, --amqp_host <host>", "The AMQP server address [amqp://localhost]", "amqp://localhost")
    .action(options => {
        AmqpConnectionFactory.create(options.amqp_host).subscribe(() => {
            consoleLogger.warn("amqp connection OK");
            process.exit();
        }, (err) => {
            consoleLogger.warn("Cannot connect to the amqp server => ", err.message);
        });
    });

program.command("import <papiUrl> <domainUuid>")
    .description("Listen to the message-queue to import data in an OBM instance")
    .option("-u, --papi_user <user>", "The PAPI user login [admin0@global.virt]", "admin0@global.virt")
    .option("-p, --papi_pwd <password>", "The PAPI user password [admin]", "admin")
    .option("-h, --amqp_host <host>", "The AMQP server address [amqp://localhost]", "amqp://localhost")
    .option("-s, --batch_size <size>", "Maximum item (e.g. event) count in one batch [5]", arg => parseInt(arg, 10), 5)
    .option("-w, --batch_wait <wait>", "Time to wait (in ms) for new message from the message-queue before making a batch [5000]", arg => parseInt(arg, 10), 5000)
    .option("-d, --batch_delay <delay>", "Minimal time (in ms) to wait between two batches, can be used to avoid PAPI overload [1000]", arg => parseInt(arg, 10), 1000)
    .option("-i, --batch_check_interval <interval>", "Time (in ms) to wait between two checks of the current batch [1000]", arg => parseInt(arg, 10), 1000)
    .option("-t, --only_type <type>", "Import only one type of entity, possible values are: EVENT, CONTACT. [ALL]")
    .action((papiUrl, domainUuid, options) => {
        ImporterFactory.create(papiUrl, domainUuid, options).importAll();
    });

function outputHelpIfNoCommand() {
    if (!process.argv.slice(2).length) {
        program.outputHelp();
    }
}

program.parse(process.argv);
outputHelpIfNoCommand();
