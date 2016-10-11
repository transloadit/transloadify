import EventEmitter from "events";

const files = {
    "a": ["d", "e", "f"],
    "a/d": false,
    "a/e": false,
    "a/f": ["g", "h", "i"],
    "a/f/g": false,
    "a/f/h": false,
    "a/f/i": false,
    "b": ["k", "l"],
    "b/k": false,
    "b/l": false,
    "c": false
};

export const fs = {
    readdir(dir, cb) {
        process.nextTick(() => files[dir] ? cb(null, files[dir]) : cb(new Error("Not a directory")));
    },
    stat(file, cb) {
        if (file in files) cb(null, { isDirectory() { return !!files[file] } });
        else cb(new Error("ENOENT"));
    },
    statSync(file) {
        if (file in files) return { isDirectory() { return !!files[file] } };
        else throw new Error("ENOENT");
    },
    fstatSync(stream) {
        return { isDirectory() { return false } };
    },
    createReadStream(file) {
        return { mode: "read", path: file, end() {} };
    },
    createWriteStream(file) {
        return { mode: "write", path: file, end() {}, on() {} };
    }
};

export const stdio = {
    stdin:  { mode: "read",  path: "<STDIN>",  end() {}, fd: 0 },
    stdout: { mode: "write", path: "<STDOUT>", end() {}, on() {}, fd: 1 }
};

// TODO handle the case where file is a directory
export function watch(file, { recursive }) {
    let emitter = new EventEmitter();
    process.nextTick(() => {
        emitter.emit("change", file);
        process.nextTick(() => {
            emitter.emit("change", file);
            emitter.emit("end");
        });
    });
    return emitter;
}

export const monitor = new EventEmitter();

export const http = {
    get(url, cb) {
        process.nextTick(() => {
            cb({
                statusCode: 200,
                unpipe() {},
                pipe(out) {
                    monitor.emit("execution", {
                        ins: url.map(a => a.path),
                        out: out.path
                    });
                }
            });
        });
        return { on() {} };
    }
};

export class TransloaditClient {
    constructor() {
        this.assemblies = [];
        this.streams = [];
    }
    addStream(name, stream) {
        this.streams.push(stream);
    }
    createAssembly(params, cb) {
        let assembly = this.assemblies.push(this.streams) - 1;
        this.streams = [];
        process.nextTick(() => cb(null, { assembly_id: assembly }));
    }
    getAssembly(id, cb) {
        process.nextTick(() => cb(null, { assembly_ssl_url: this.assemblies[id] }));
    }
}
