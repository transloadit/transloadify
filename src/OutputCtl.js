export default class OutputCtl {
    constructor({ logLevel, jsonMode }) {
        this.json = jsonMode;
        this.logLevel = logLevel;
    }
    
    error(msg) {
        console.error("ERROR  ", msg);
    }

    warn(msg) {
        if (this.logLevel > 0) console.error("WARNING", msg);
    }

    info(msg) {
        if (this.logLevel > 0) console.error("INFO   ", msg);
    }

    debug(msg) {
        if (this.logLevel > 1) console.error("DEBUG  ", msg);
    }

    print(simple, json) {
        if (this.json) console.log(json);
        else console.log(simple);
    }
}
