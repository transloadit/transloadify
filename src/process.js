import TransloaditClient from "transloadify";
import fs from "fs";
import watch from "node-watch";
import EventEmitter from "events";
import http from "http";

function myStatSync(stdioStream, path) {
    if (path === "-") return fs.fstatSync(stdioStream.fd);
    return fs.statSync(path);
}

function dirProvider(output) {
    // FIXME this will place outputs outside the output directory if the inputs
    // are oudside PWD
    return inpath => fs.createWriteStream(path.resolve(output, path.realtive(process.cwd(), inpath)));
}

function fileProvider(output) {
    return inpath => output === "-" ? process.stdout : fs.createWriteStream(output);
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
    constructor({ dir, streamRegistry, recursive, outstreamProvider }) {
        super();
        
        let awaitCount = 0;
        const complete = () => {
            if (--awaitCount === 0) this.emit("end");
        };

        fs.readdir(dir, (err, files) => {
            if (err != null) return this.emit("error", err);

            awaitCount += files.length;

            for (let file of files) {
                file = path.normalize(path.resolve(path, file));
                fs.stat(file, (err, stats) => {
                    if (err != null) return this.emit("error", err);

                    if (stats.isDirectory()) {
                        if (recursive) {
                            let subdirEmitter = newReaddirJobEmitter({ file, streamRegistry, recursive, outstreamProvider });
                            subdirEmitter.on("job", job => this.emit("job", job));
                            subdirEmitter.on("error", job => this.emit("error", error));
                            subdirEmitter.on("end", complete);
                        } else {
                            complete();
                        }
                    } else {
                        if (streamRegistry[file]) streamRegistry[file].end();
                        let outstream = streamRegistry[file] = outstreamProvider(file);
                        this.emit("job", { in: fs.createReadStream(file), out: outstream });
                        complete();
                    }
                });
            }
        });
    }
}

class SingleJobEmitter extends MyEventEmitter {
    constructor({ file, streamRegistry, outstreamProvider }) {
        super();

        file = path.normalize(file);
        if (streamRegistry[file]) streamRegistry[file].end();
        let outstream = streamRegistry[file] = outstreamProvider(file);
        this.emit("job", { in: fs.createReadStream(file), out: outstream });
        this.emit("end");
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
            if (streamRegistry[file]) streamRegistry[file].end();
            let outstream = streamRegistry[file] = outstreamProvider(file);
            this.emit("job", { in: fs.createReadStream(file), out: outstream });
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

export default function process(client, { steps, template, fields, watch, recursive, inputs, output }) {
    if (inputs.length === 0) inputs = [ "-" ];

    let params = steps ? { steps: require(steps) } : { template_id: template };
    params.fields = fields;
    
    let outstat = myStatSync(process.stdout, output);
    if (!outstat.isDirectory()) {
        if (inputs.length > 1) throw new Error();
        if (myStatSync(process.stdin, inputs[0]).isDirectory()) throw new Error();
    }

    let outstreamProvider = outstat.isDirectory() ? dirProvider(output) : fileProvider(output);
    let streamRegistry = {};

    let emitter = makeJobEmitter(inputs, { recursive, watch, outstreamProvider, streamRegistry });

    emitter.on("job", job => {
        let superceded = false;
        job.out.on("finish", () => superceded = true);

        client.addStream("in", job.in);

        client.createAssembly({ params }, (err, result) => {
            if (err != null) return console.error(err);

            if (superceded) return;
            
            client.getAssembly(result.assembly_id, (err, result) => {
                if (err != null) return console.error(err);

                if (superceded) return;

                http.get(result.assembly_ssl_url, res => {
                    if (res.statusCode !== 200) {
                        console.error(new Error(`Server returned http status ${res.statusCode}`));
                        return;
                    }

                    if (superceded) return;

                    res.pipe(job.out);
                    job.out.on("finish", () => res.unpipe()); // TODO is this done automatically?
                }).on("error", console.error);
            });
        });
    });

    emitter.on("error", err => {
        console.error(err);
    });
}
