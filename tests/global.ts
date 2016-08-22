import {batchErrorLogger, logger} from "../src/logger";

function doNotProduceAnyLogDuringTests() {
    logger.clear();
    batchErrorLogger.clear();
}

beforeEach(() => {
    doNotProduceAnyLogDuringTests();
});
