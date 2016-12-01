import fs from "fs";

export function createReadStream(file) {
    if (file === "-") return process.stdin;
    else return fs.createReadStream(file);
}

export function stream2buf(stream, cb) {
    let size = 0;
    let bufs = [];

    stream.on("error", cb);

    stream.on("readable", () => {
        let chunk = stream.read();
        if (chunk === null) return;

        size += chunk.length;
        bufs.push(chunk);
    });

    stream.on("end", () => {
        let buf = new Buffer(size);
        let offset = 0;

        for (let b of bufs) {
            b.copy(buf, offset);
            offset += b.length;
        }

        cb(null, buf);
    });
}

export function inSequence(promises, fulfilled, rejected) {
    promises.reduce((a, b) => {
        return a.then((...args) => {
            fulfilled(...args);
            return b;
        });
    }).then(fulfilled).fail(rejected);
}

export function formatAPIError(err) {
    return `${err.error}: ${err.message}`;
}
