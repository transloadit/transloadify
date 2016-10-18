let fs, watch, http, _STDIN, STDOUT;
if (process.env.NODE_ENV === "test") {
    const mocks = require("./process-mocks");
    fs = mocks.fs;
    watch = mocks.watch;
    http = mocks.http;
    STDOUT = mocks.stdio.stdout;
} else {
    fs = require("fs");
    watch = require("node-watch");
    http = require("http");
    STDOUT = process.stdout;
}

function STDIN() {
    if (_STDIN) return _STDIN;
    if (process.env.NODE_ENV === "test") _STDIN = mocks.stdio.stdin;
    else {
        _STDIN = fs.createReadStream("/dev/stdin");
        _STDIN.fd = 0; // careful...
    }
    return _STDIN;
}

import path from "path";
import EventEmitter from "events";

function myStatSync(stdioStream, path) {
    if (path === "-") return fs.fstatSync(stdioStream.fd);
    return fs.statSync(path);
}

function ensureDir(dir) {
    try { fs.mkdirSync(dir); }
    catch (e) {
        if (e.code === "EEXIST") {
            if (!fs.statSync(dir).isDirectory()) throw e;
            return;
        }
        if (e.code !== "ENOENT") throw e;

        ensureDir(path.dirname(dir));
        fs.mkdirSync(dir);
    }
}

function dirProvider(output) {
    return (inpath, indir=process.cwd()) => {
        let relpath = path.relative(indir, inpath)
        // if inpath is outside indir, ensure that outpath will still be inside
        // output
        relpath = relpath.replace(/^(\.\.\/)+/, "");
        let outpath = path.join(output, relpath);
        let outdir = path.dirname(outpath);

        // TODO can this be moved elsewhere to avoid synchronous IO?
        ensureDir(outdir);

        return fs.createWriteStream(outpath);
    };
}

function fileProvider(output) {
    ensureDir(path.dirname(output));
    return inpath => output === "-" ? STDOUT : fs.createWriteStream(output);
}

class MyEventEmitter extends EventEmitter {
    constructor(...args) {
        super(...args);
        this.hasEnded = false;
    }

    emit(event, ...args) {
        if (this.hasEnded) return;
        if (event === "end" || event === "error") {
            this.hasEnded = true;
            super.emit(event, ...args);
            return;
        }
        super.emit(event, ...args);
    }
}

class ReaddirJobEmitter extends MyEventEmitter {
    constructor({ dir, streamRegistry, recursive, outstreamProvider, topdir=dir }) {
        super();
        
        process.nextTick(() => {
            let awaitCount = 0;
            const complete = () => {
                if (--awaitCount === 0) this.emit("end");
            };

            fs.readdir(dir, (err, files) => {
                if (err != null) return this.emit("error", err);

                awaitCount += files.length;

                for (let file of files) {
                    file = path.normalize(path.join(dir, file));
                    fs.stat(file, (err, stats) => {
                        if (err != null) return this.emit("error", err);

                        if (stats.isDirectory()) {
                            if (recursive) {
                                let subdirEmitter = new ReaddirJobEmitter(
                                    { dir: file, streamRegistry, recursive, outstreamProvider, topdir });
                                subdirEmitter.on("job", job => this.emit("job", job));
                                subdirEmitter.on("error", error => this.emit("error", error));
                                subdirEmitter.on("end", complete);
                            } else {
                                complete();
                            }
                        } else {
                            if (streamRegistry[file]) streamRegistry[file].end();
                            let outstream = streamRegistry[file] = outstreamProvider(file, topdir);
                            this.emit("job", { in: fs.createReadStream(file), out: outstream });
                            complete();
                        }
                    });
                }
            });
        });
    }
}

class SingleJobEmitter extends MyEventEmitter {
    constructor({ file, streamRegistry, outstreamProvider }) {
        super();

        file = path.normalize(file);
        if (streamRegistry[file]) streamRegistry[file].end();
        let outstream = streamRegistry[file] = outstreamProvider(file);
        let instream = file === "-" ? STDIN() : fs.createReadStream(file);

        process.nextTick(() => {
            this.emit("job", { in: instream, out: outstream });
            this.emit("end");
        });
    }
}

class NullJobEmitter extends MyEventEmitter {
    constructor() {
        super();

        process.nextTick(() => this.emit("end"));
    }
}

class WatchJobEmitter extends MyEventEmitter {
    constructor({ file, streamRegistry, recursive, outstreamProvider }) {
        super();

        let watcher = watch(file, { recursive, followSymLinks: true });

        watcher.on("error", err => this.emit("error", err));
        watcher.on("end", () => this.emit("end"));
        watcher.on("change", file => {
            file = path.normalize(file);
            fs.stat(file, (err, stats) => {
                if (err) return this.emit("error", err);
                if (stats.isDirectory()) return;
                if (streamRegistry[file]) streamRegistry[file].end();
                let outstream = streamRegistry[file] = outstreamProvider(file);
                let instream = fs.createReadStream(file);
                this.emit("job", { in: instream, out: outstream });
            });
        });
    }
}

class MergedJobEmitter extends MyEventEmitter {
    constructor(...jobEmitters) {
        super();

        let ncomplete = 0;

        for (let jobEmitter of jobEmitters) {
            jobEmitter.on("error", err => this.emit("error", err));
            jobEmitter.on("job", job => this.emit("job", job));
            jobEmitter.on("end", () => {
                if (++ncomplete === jobEmitters.length) this.emit("end");
            });
        }
    }
}

class ConcattedJobEmitter extends MyEventEmitter {
    constructor(emitterFn, ...emitterFns) {
        super();

        let emitter = emitterFn();

        if (emitterFns.length === 0) {
            emitter.on("error", err => this.emit("error", err));
            emitter.on("job", job => this.emit("job", job));
            emitter.on("end", () => this.emit("end"));
        } else {
            emitter.on("error", err => this.emit("error", err));
            emitter.on("job", job => this.emit("job", job));
            emitter.on("end", () => {
                let restEmitter = new ConcattedJobEmitter(...emitterFns);
                restEmitter.on("error", err => this.emit("error", err));
                restEmitter.on("job", job => this.emit("job", job));
                restEmitter.on("end", () => this.emit("end"));
            });
        }
    }
}

function makeJobEmitter(inputs, { recursive, outstreamProvider, streamRegistry, watch }) {
    let emitter = new EventEmitter();
    
    let emitterFns = [];
    let watcherFns = [];

    for (let input of inputs) {
        if (input === "-") {
            emitterFns.push(
                () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry }));
            watcherFns.push(
                () => new NullJobEmitter());

            startEmitting();
        } else {
            fs.stat(input, (err, stats) => {
                if (err != null) return emitter.emit("error", err);
                
                if (stats.isDirectory()) {
                    emitterFns.push(
                        () => new ReaddirJobEmitter({ dir: input, recursive, outstreamProvider, streamRegistry }));
                    watcherFns.push(
                        () => new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry }));
                } else {
                    emitterFns.push(
                        () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry }));
                    watcherFns.push(
                        () => new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry }));
                }

                startEmitting();
            });
        }
    }

    function startEmitting() {
        if (emitterFns.length !== inputs.length) return;
        
        let source = new MergedJobEmitter(...emitterFns.map(f => f()));

        if (watch) {
            source = new ConcattedJobEmitter(() => source,
                                             () => new MergedJobEmitter(...watcherFns.map(f => f())));
        }

        source.on("job", job => emitter.emit("job", job));
        source.on("error", err => emitter.emit("error", err));
        source.on("end", () => emitter.emit("end"));
    }

    return emitter;
}

export default function run(client, { steps, template, fields, watch, recursive, inputs, output }) {
    if (inputs.length === 0) inputs = [ "-" ];

    let params = steps ? { steps: require(steps) } : { template_id: template };
    params.fields = fields;
    
    let outstat = myStatSync(STDOUT, output);
    if (!outstat.isDirectory()) {
        if (inputs.length > 1) throw new Error();
        if (myStatSync(STDIN(), inputs[0]).isDirectory()) throw new Error();
    }

    let outstreamProvider = outstat.isDirectory() ? dirProvider(output) : fileProvider(output);
    let streamRegistry = {};

    let emitter = makeJobEmitter(inputs, { recursive, watch, outstreamProvider, streamRegistry });

    emitter.on("job", job => {
        console.error("GOT JOB", job.in.path, job.out.path);
        let superceded = false;
        job.out.on("finish", () => superceded = true);

        client.addStream("in", job.in);

        client.createAssembly({ params }, (err, result) => {
            if (err != null) return console.error(err);

            if (superceded) return;
            
            client.getAssembly(result.assembly_id, function callback(err, result) {
                if (err != null) return console.error(err);

                if (superceded) return;

                if (result.ok !== "ASSEMBLY_COMPLETED") {
                    client.getAssembly(result.assembly_id, callback);
                    return;
                }

                let resulturl = result.results[Object.keys(result.results)[0]][0].url;
                
                http.get(resulturl, res => {
                    if (res.statusCode !== 200) {
                        console.error(new Error(`Server returned http status ${res.statusCode}`));
                        return;
                    }

                    if (superceded) return;

                    res.pipe(job.out);
                    res.on("end", () => console.error("COMPLETED", job.in.path, job.out.path));
                    job.out.on("finish", () => res.unpipe()); // TODO is this done automatically?
                }).on("error", console.error);
            });
        });
    });

    emitter.on("error", err => {
        console.error(err);
    });
}