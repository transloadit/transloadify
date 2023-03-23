import fs from 'fs'
import watch from 'node-watch'
import http from 'http'
import path from 'path'
import EventEmitter from 'events'
import tty from 'tty'
import Q from 'q'
import JobsPromise from './JobsPromise'

// workaround for determining mime-type of stdin
process.stdin.path = '/dev/stdin'

function myStatSync(stdioStream, path) {
  if (path === '-') return fs.fstatSync(stdioStream.fd)
  return fs.statSync(path)
}

function ensureDir(dir) {
  return Q.nfcall(fs.mkdir, dir).fail((err) => {
    if (err.code === 'EEXIST') {
      return Q.nfcall(fs.stat, dir).then((stats) => {
        if (!stats.isDirectory()) throw err
      })
    }
    if (err.code !== 'ENOENT') throw err

    return ensureDir(path.dirname(dir)).then(() => {
      return Q.nfcall(fs.mkdir, dir)
    })
  })
}

function dirProvider(output) {
  return (inpath, indir = process.cwd()) => {
    if (inpath == null || inpath === '-') {
      throw new Error('You must provide an input to output to a directory')
    }

    let relpath = path.relative(indir, inpath)
    // if inpath is outside indir, ensure that outpath will still be inside
    // output
    relpath = relpath.replace(/^(\.\.\/)+/, '')
    let outpath = path.join(output, relpath)
    let outdir = path.dirname(outpath)

    return ensureDir(outdir)
      .then(() => {
        return Q.nfcall(fs.stat, outpath)
          .then((stats) => stats.mtime)
          .fail(() => new Date(0))
      })
      .then((mtime) => {
        let outstream = fs.createWriteStream(outpath)
        outstream.mtime = mtime
        return outstream
      })
  }
}

function fileProvider(output) {
  let dirExistsP = ensureDir(path.dirname(output))
  return (inpath) => {
    return dirExistsP.then(() => {
      if (output === '-') return process.stdout

      let mtimeP = Q.nfcall(fs.stat, output)
        .then((stats) => stats.mtime)
        .fail(() => new Date(0))

      return mtimeP.then((mtime) => {
        let outstream = fs.createWriteStream(output)
        outstream.mtime = mtime
        return outstream
      })
    })
  }
}

function nullProvider() {
  return (inpath) => Q.fcall(() => null)
}

class MyEventEmitter extends EventEmitter {
  constructor(...args) {
    super(...args)
    this.hasEnded = false
  }

  emit(event, ...args) {
    if (this.hasEnded) return
    if (event === 'end' || event === 'error') {
      this.hasEnded = true
      super.emit(event, ...args)
      return
    }
    super.emit(event, ...args)
  }
}

class ReaddirJobEmitter extends MyEventEmitter {
  constructor({ dir, streamRegistry, recursive, outstreamProvider, topdir = dir }) {
    super()

    process.nextTick(() => {
      let awaitCount = 0
      const complete = () => {
        if (--awaitCount === 0) this.emit('end')
      }

      fs.readdir(dir, (err, files) => {
        if (err != null) return this.emit('error', err)

        awaitCount += files.length

        for (let file of files) {
          file = path.normalize(path.join(dir, file))
          fs.stat(file, (err, stats) => {
            if (err != null) return this.emit('error', err)

            if (stats.isDirectory()) {
              if (recursive) {
                let subdirEmitter = new ReaddirJobEmitter({
                  dir: file,
                  streamRegistry,
                  recursive,
                  outstreamProvider,
                  topdir,
                })
                subdirEmitter.on('job', (job) => this.emit('job', job))
                subdirEmitter.on('error', (error) => this.emit('error', error))
                subdirEmitter.on('end', complete)
              } else {
                complete()
              }
            } else {
              if (streamRegistry[file]) streamRegistry[file].end()
              outstreamProvider(file, topdir).then((outstream) => {
                streamRegistry[file] = outstream
                this.emit('job', { in: fs.createReadStream(file), out: outstream })
                complete()
              })
            }
          })
        }
      })
    })
  }
}

class SingleJobEmitter extends MyEventEmitter {
  constructor({ file, streamRegistry, outstreamProvider }) {
    super()

    file = path.normalize(file)
    if (streamRegistry[file]) streamRegistry[file].end()
    outstreamProvider(file).then((outstream) => {
      streamRegistry[file] = outstream

      let instream
      if (file === '-') {
        if (tty.isatty(process.stdin.fd)) {
          instream = null // Don't read from stdin if it's input from the console
        } else {
          instream = process.stdin
        }
      } else {
        instream = fs.createReadStream(file)
      }

      process.nextTick(() => {
        this.emit('job', { in: instream, out: outstream })
        this.emit('end')
      })
    })
  }
}

class InputlessJobEmitter extends MyEventEmitter {
  constructor({ streamRegistry, outstreamProvider }) {
    super()

    process.nextTick(() => {
      outstreamProvider(null).then((outstream) => {
        try {
          this.emit('job', { in: null, out: outstream })
        } catch (err) {
          this.emit('error', err)
        }

        this.emit('end')
      })
    })
  }
}

class NullJobEmitter extends MyEventEmitter {
  constructor() {
    super()

    process.nextTick(() => this.emit('end'))
  }
}

class WatchJobEmitter extends MyEventEmitter {
  constructor({ file, streamRegistry, recursive, outstreamProvider }) {
    super()

    fs.stat(file, (err, stats) => {
      if (err) return this.emit('error', err)
      let topdir = stats.isDirectory() ? file : undefined

      let watcher = watch(file, { recursive, followSymLinks: true })

      watcher.on('error', (err) => this.emit('error', err))
      watcher.on('end', () => this.emit('end'))
      watcher.on('change', (file) => {
        file = path.normalize(file)
        fs.stat(file, (err, stats) => {
          if (err) return this.emit('error', err)
          if (stats.isDirectory()) return
          if (streamRegistry[file]) streamRegistry[file].end()
          outstreamProvider(file, topdir).then((outstream) => {
            streamRegistry[file] = outstream

            let instream = fs.createReadStream(file)
            this.emit('job', { in: instream, out: outstream })
          })
        })
      })
    })
  }
}

class MergedJobEmitter extends MyEventEmitter {
  constructor(...jobEmitters) {
    super()

    let ncomplete = 0

    for (let jobEmitter of jobEmitters) {
      jobEmitter.on('error', (err) => this.emit('error', err))
      jobEmitter.on('job', (job) => this.emit('job', job))
      jobEmitter.on('end', () => {
        if (++ncomplete === jobEmitters.length) this.emit('end')
      })
    }

    if (jobEmitters.length === 0) {
      this.emit('end')
    }
  }
}

class ConcattedJobEmitter extends MyEventEmitter {
  constructor(emitterFn, ...emitterFns) {
    super()

    let emitter = emitterFn()

    emitter.on('error', (err) => this.emit('error', err))
    emitter.on('job', (job) => this.emit('job', job))

    if (emitterFns.length === 0) {
      emitter.on('end', () => this.emit('end'))
    } else {
      emitter.on('end', () => {
        let restEmitter = new ConcattedJobEmitter(...emitterFns)
        restEmitter.on('error', (err) => this.emit('error', err))
        restEmitter.on('job', (job) => this.emit('job', job))
        restEmitter.on('end', () => this.emit('end'))
      })
    }
  }
}

function detectConflicts(jobEmitter) {
  let emitter = new MyEventEmitter()
  let outfileAssociations = {}

  jobEmitter.on('end', () => emitter.emit('end'))
  jobEmitter.on('error', (err) => emitter.emit('error', err))
  jobEmitter.on('job', (job) => {
    if (job.in == null || job.out == null) {
      emitter.emit('job', job)
      return
    }
    if (
      outfileAssociations.hasOwnProperty(job.out.path) &&
      outfileAssociations[job.out.path] !== job.in.path
    ) {
      emitter.emit(
        'error',
        new Error(
          `Output collision between '${job.in.path}' and '${outfileAssociations[job.out.path]}'`
        )
      )
    } else {
      outfileAssociations[job.out.path] = job.in.path
      emitter.emit('job', job)
    }
  })

  return emitter
}

function dismissStaleJobs(jobEmitter) {
  let emitter = new MyEventEmitter()

  let jobsPromise = new JobsPromise()

  jobEmitter.on('end', () => jobsPromise.promise().then(() => emitter.emit('end')))
  jobEmitter.on('error', (err) => emitter.emit('error', err))
  jobEmitter.on('job', (job) => {
    if (job.in == null || job.out == null) return emitter.emit('job', job)

    jobsPromise.add(
      Q.nfcall(fs.stat, job.in.path)
        .then((stats) => {
          let inM = stats.mtime
          let outM = job.out.mtime || new Date(0)

          if (outM <= inM) emitter.emit('job', job)
        })
        .fail(() => {
          emitter.emit('job', job)
        })
    )
  })

  return emitter
}

function makeJobEmitter(
  inputs,
  { recursive, outstreamProvider, streamRegistry, watch, reprocessStale }
) {
  let emitter = new EventEmitter()

  let emitterFns = []
  let watcherFns = []

  for (let input of inputs) {
    if (input === '-') {
      emitterFns.push(
        () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry })
      )
      watcherFns.push(() => new NullJobEmitter())

      startEmitting()
    } else {
      fs.stat(input, (err, stats) => {
        if (err != null) return emitter.emit('error', err)
        if (stats.isDirectory()) {
          emitterFns.push(
            () =>
              new ReaddirJobEmitter({ dir: input, recursive, outstreamProvider, streamRegistry })
          )
          watcherFns.push(
            () => new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry })
          )
        } else {
          emitterFns.push(
            () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry })
          )
          watcherFns.push(
            () => new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry })
          )
        }

        startEmitting()
      })
    }
  }

  if (inputs.length === 0) {
    emitterFns.push(() => new InputlessJobEmitter({ outstreamProvider, streamRegistry }))
    startEmitting()
  }

  function startEmitting() {
    if (inputs.length !== 0 && emitterFns.length !== inputs.length) return

    let source = new MergedJobEmitter(...emitterFns.map((f) => f()))

    if (watch) {
      source = new ConcattedJobEmitter(
        () => source,
        () => new MergedJobEmitter(...watcherFns.map((f) => f()))
      )
    }

    source.on('job', (job) => emitter.emit('job', job))
    source.on('error', (err) => emitter.emit('error', err))
    source.on('end', () => emitter.emit('end'))
  }

  let stalefilter = reprocessStale ? (x) => x : dismissStaleJobs
  return stalefilter(detectConflicts(emitter))
}

export default function run(
  outputctl,
  client,
  { steps, template, fields, watch, recursive, inputs, output, del, reprocessStale }
) {
  // Quick fix for https://github.com/transloadit/transloadify/issues/13
  // stdin or stdout is only respected when the input or output flag is '-'
  if (!inputs.length && !process.stdin.isTTY) inputs = ['-']
  if (!output == null && !process.stdout.isTTY) output = '-'

  let deferred = Q.defer()

  let params = steps ? { steps: JSON.parse(fs.readFileSync(steps)) } : { template_id: template }
  params.fields = fields

  let outstat

  if (output != null) {
    try {
      outstat = myStatSync(process.stdout, output)
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
      outstat = { isDirectory: () => false }
    }

    if (!outstat.isDirectory() && inputs.length !== 0) {
      if (inputs.length > 1 || myStatSync(process.stdin, inputs[0]).isDirectory()) {
        const msg = 'Output must be a directory when specifying multiple inputs'
        outputctl.error(msg)
        return deferred.reject(new Error(msg))
      }
    }
  }

  let outstreamProvider =
    output == null
      ? nullProvider()
      : outstat.isDirectory()
      ? dirProvider(output)
      : fileProvider(output)
  let streamRegistry = {}

  let emitter = makeJobEmitter(inputs, {
    recursive,
    watch,
    outstreamProvider,
    streamRegistry,
    reprocessStale,
  })

  let jobsPromise = new JobsPromise()
  emitter.on('job', (job) => {
    outputctl.debug(`GOT JOB ${job.in && job.in.path} ${job.out && job.out.path}`)

    let superceded = false
    if (job.out != null)
      job.out.on('finish', () => {
        superceded = true
      })

    if (job.in != null) client.addStream('in', job.in)

    jobsPromise.add(
      Q.nfcall(client.createAssembly.bind(client), { params }).then((result) => {
        if (superceded) return

        return Q.nfcall(client.getAssembly.bind(client), result.assembly_id).then(function callback(
          result
        ) {
          if (superceded) return

          if (result.ok !== 'ASSEMBLY_COMPLETED') {
            return Q.delay(250)
              .then(() => Q.nfcall(client.getAssembly.bind(client), result.assembly_id))
              .then(callback)
          }

          let resulturl = result.results[Object.keys(result.results)[0]][0].url

          if (job.out != null) {
            outputctl.debug('DOWNLOADING')
            return Q.Promise((resolve, reject) => {
              http
                .get(resulturl, (res) => {
                  if (res.statusCode !== 200) {
                    let msg = `Server returned http status ${res.statusCode}`
                    outputctl.error(msg)
                    return reject(new Error(msg))
                  }

                  if (superceded) return resolve()

                  res.pipe(job.out)
                  job.out.on('finish', () => res.unpipe()) // TODO is this done automatically?
                  resolve(
                    Q.Promise((resolve) => {
                      res.on('end', () => {
                        resolve(completeJob())
                      })
                    })
                  )
                })
                .on('error', (err) => {
                  outputctl.error(err.message)
                  reject(err)
                })
            })
          } else {
            return completeJob()
          }

          function completeJob() {
            outputctl.debug(`COMPLETED ${job.in && job.in.path} ${job.out && job.out.path}`)

            if (del && job.in != null) {
              return Q.nfcall(fs.unlink, job.in.path)
            }
          }
        })
      })
    )
  })

  jobsPromise.on('error', (err) => {
    outputctl.error(err)
  })

  emitter.on('error', (err) => {
    outputctl.error(err)
    deferred.reject(err)
  })

  emitter.on('end', () => {
    deferred.resolve(jobsPromise.promise())
  })

  return deferred.promise
}
