import fs from "fs";
import path from "path";

export default class OutputProvider {
    outputStreamFor(inputFileName) { }
}

export class Directory extends OutputProvider {
    constructor(dirName) {
        this.dir = dirName;
    }

    outputStreamFor(inputFileName) {
        return fs.createWriteStream(path.resolve(this.dir, inputFileName));
    }
}

export class File extends OutputProvider {
    constructor(fileFn) {
        this.fn = fileFn;
    }

    outputStreamFor(_) {
        return fn();
    }
}
