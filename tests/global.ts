import {logger} from "../src/logger";

function doNotProduceAnyLogDuringTests() {
    logger.clear();
}

beforeEach(() => {
    doNotProduceAnyLogDuringTests();
});
