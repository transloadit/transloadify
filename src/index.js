import TransloaditClient from "transloadit";
import cli from "./cli";
import fs from "fs";

class Logger {
    constructor(logLevel) {
        this.logLevel = logLevel;
    }
    error(...args) {
        console.error(...args);
    }
    warn(...args) {
        if (this.logLevel >= 1) console.error(...args);
    }
    info(...args) {
        if (this.logLevel >= 1) console.log(...args);
    }
    debug(...args) {
        if (this.logLevel === 2) console.log(...args);
    }
}

const program = cli();
if (program.error != null) {
    console.error(program.message);
    process.exit();
}

global.log = new Logger(program.logLevel);

const modes = {
    process: require("./process")
};

modes[program.mode](program);
