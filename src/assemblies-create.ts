import EventEmitter from 'node:events'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import type { Readable, Writable } from 'node:stream'
import tty from 'node:tty'
import type {
  AssemblyStatus,
  CreateAssemblyOptions,
  CreateAssemblyParams,
  Transloadit,
} from 'transloadit'
import JobsPromise from './JobsPromise.js'
import type { IOutputCtl } from './OutputCtl.js'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const nodeWatch: (
  path: string,
  options?: { recursive?: boolean },
) => {
  on(event: 'error', listener: (err: Error) => void): void
  on(event: 'close', listener: () => void): void
  on(event: 'change', listener: (evt: string, filename: string) => void): void
  on(event: string, listener: (...args: unknown[]) => void): void
} = require('node-watch')

// Extend stdin to have path property for mime-type detection
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace NodeJS {
    interface ReadStream {
      path: string
    }
  }
}
// workaround for determining mime-type of stdin
;(process.stdin as NodeJS.ReadStream).path = '/dev/stdin'

interface OutStream extends Writable {
  path?: string
  mtime?: Date
}

interface Job {
  in: Readable | null
  out: OutStream | null
}

type OutstreamProvider = (inpath: string | null, indir?: string) => Promise<OutStream | null>

interface StreamRegistry {
  [key: string]: OutStream | undefined
}

interface JobEmitterOptions {
  recursive?: boolean
  outstreamProvider: OutstreamProvider
  streamRegistry: StreamRegistry
  watch?: boolean
  reprocessStale?: boolean
}

interface ReaddirJobEmitterOptions {
  dir: string
  streamRegistry: StreamRegistry
  recursive?: boolean
  outstreamProvider: OutstreamProvider
  topdir?: string
}

interface SingleJobEmitterOptions {
  file: string
  streamRegistry: StreamRegistry
  outstreamProvider: OutstreamProvider
}

interface WatchJobEmitterOptions {
  file: string
  streamRegistry: StreamRegistry
  recursive?: boolean
  outstreamProvider: OutstreamProvider
}

interface StatLike {
  isDirectory(): boolean
}

function myStatSync(
  stdioStream: NodeJS.ReadStream | NodeJS.WriteStream,
  filepath: string,
): fs.Stats {
  if (filepath === '-') return fs.fstatSync((stdioStream as NodeJS.ReadStream & { fd: number }).fd)
  return fs.statSync(filepath)
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fsp.mkdir(dir)
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'EEXIST') {
      const stats = await fsp.stat(dir)
      if (!stats.isDirectory()) throw err
      return
    }
    if (e.code !== 'ENOENT') throw err

    await ensureDir(path.dirname(dir))
    await fsp.mkdir(dir)
  }
}

function dirProvider(output: string): OutstreamProvider {
  return async (inpath, indir = process.cwd()) => {
    if (inpath == null || inpath === '-') {
      throw new Error('You must provide an input to output to a directory')
    }

    let relpath = path.relative(indir, inpath)
    relpath = relpath.replace(/^(\.\.\/)+/, '')
    const outpath = path.join(output, relpath)
    const outdir = path.dirname(outpath)

    await ensureDir(outdir)
    let mtime: Date
    try {
      const stats = await fsp.stat(outpath)
      mtime = stats.mtime
    } catch (_err) {
      mtime = new Date(0)
    }
    const outstream = fs.createWriteStream(outpath) as OutStream
    outstream.mtime = mtime
    return outstream
  }
}

function fileProvider(output: string): OutstreamProvider {
  const dirExistsP = ensureDir(path.dirname(output))
  return async (_inpath) => {
    await dirExistsP
    if (output === '-') return process.stdout as OutStream

    let mtime: Date
    try {
      const stats = await fsp.stat(output)
      mtime = stats.mtime
    } catch (_err) {
      mtime = new Date(0)
    }
    const outstream = fs.createWriteStream(output) as OutStream
    outstream.mtime = mtime
    return outstream
  }
}

function nullProvider(): OutstreamProvider {
  return async (_inpath) => null
}

class MyEventEmitter extends EventEmitter {
  protected hasEnded: boolean

  constructor() {
    super()
    this.hasEnded = false
  }

  override emit(event: string | symbol, ...args: unknown[]): boolean {
    if (this.hasEnded) return false
    if (event === 'end' || event === 'error') {
      this.hasEnded = true
      return super.emit(event, ...args)
    }
    return super.emit(event, ...args)
  }
}

class ReaddirJobEmitter extends MyEventEmitter {
  constructor({
    dir,
    streamRegistry,
    recursive,
    outstreamProvider,
    topdir = dir,
  }: ReaddirJobEmitterOptions) {
    super()

    process.nextTick(() => {
      let awaitCount = 0
      const complete = (): void => {
        if (--awaitCount === 0) this.emit('end')
      }

      fs.readdir(dir, (err, files) => {
        if (err != null) return this.emit('error', err)

        awaitCount += files.length

        for (const filename of files) {
          const file = path.normalize(path.join(dir, filename))
          fs.stat(file, (err, stats) => {
            if (err != null) return this.emit('error', err)

            if (stats.isDirectory()) {
              if (recursive) {
                const subdirEmitter = new ReaddirJobEmitter({
                  dir: file,
                  streamRegistry,
                  recursive,
                  outstreamProvider,
                  topdir,
                })
                subdirEmitter.on('job', (job: Job) => this.emit('job', job))
                subdirEmitter.on('error', (error: Error) => this.emit('error', error))
                subdirEmitter.on('end', complete)
              } else {
                complete()
              }
            } else {
              const existing = streamRegistry[file]
              if (existing) existing.end()
              outstreamProvider(file, topdir).then((outstream) => {
                streamRegistry[file] = outstream ?? undefined
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
  constructor({ file, streamRegistry, outstreamProvider }: SingleJobEmitterOptions) {
    super()

    const normalizedFile = path.normalize(file)
    const existing = streamRegistry[normalizedFile]
    if (existing) existing.end()
    outstreamProvider(normalizedFile).then((outstream) => {
      streamRegistry[normalizedFile] = outstream ?? undefined

      let instream: Readable | null
      if (normalizedFile === '-') {
        if (tty.isatty(process.stdin.fd)) {
          instream = null
        } else {
          instream = process.stdin
        }
      } else {
        instream = fs.createReadStream(normalizedFile)
      }

      process.nextTick(() => {
        this.emit('job', { in: instream, out: outstream })
        this.emit('end')
      })
    })
  }
}

class InputlessJobEmitter extends MyEventEmitter {
  constructor({
    outstreamProvider,
  }: { streamRegistry: StreamRegistry; outstreamProvider: OutstreamProvider }) {
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
  constructor({ file, streamRegistry, recursive, outstreamProvider }: WatchJobEmitterOptions) {
    super()

    fs.stat(file, (err, stats) => {
      if (err) return this.emit('error', err)
      const topdir = stats.isDirectory() ? file : undefined

      const watcher = nodeWatch(file, { recursive })

      watcher.on('error', (err: Error) => this.emit('error', err))
      watcher.on('close', () => this.emit('end'))
      watcher.on('change', (_evt: string, filename: string) => {
        const normalizedFile = path.normalize(filename)
        fs.stat(normalizedFile, (err, stats) => {
          if (err) return this.emit('error', err)
          if (stats.isDirectory()) return
          const existing = streamRegistry[normalizedFile]
          if (existing) existing.end()
          outstreamProvider(normalizedFile, topdir).then((outstream) => {
            streamRegistry[normalizedFile] = outstream ?? undefined

            const instream = fs.createReadStream(normalizedFile)
            this.emit('job', { in: instream, out: outstream })
          })
        })
      })
    })
  }
}

class MergedJobEmitter extends MyEventEmitter {
  constructor(...jobEmitters: MyEventEmitter[]) {
    super()

    let ncomplete = 0

    for (const jobEmitter of jobEmitters) {
      jobEmitter.on('error', (err: Error) => this.emit('error', err))
      jobEmitter.on('job', (job: Job) => this.emit('job', job))
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
  constructor(emitterFn: () => MyEventEmitter, ...emitterFns: (() => MyEventEmitter)[]) {
    super()

    const emitter = emitterFn()

    emitter.on('error', (err: Error) => this.emit('error', err))
    emitter.on('job', (job: Job) => this.emit('job', job))

    if (emitterFns.length === 0) {
      emitter.on('end', () => this.emit('end'))
    } else {
      emitter.on('end', () => {
        const restEmitter = new ConcattedJobEmitter(emitterFns[0]!, ...emitterFns.slice(1))
        restEmitter.on('error', (err: Error) => this.emit('error', err))
        restEmitter.on('job', (job: Job) => this.emit('job', job))
        restEmitter.on('end', () => this.emit('end'))
      })
    }
  }
}

function detectConflicts(jobEmitter: EventEmitter): MyEventEmitter {
  const emitter = new MyEventEmitter()
  const outfileAssociations: Record<string, string> = {}

  jobEmitter.on('end', () => emitter.emit('end'))
  jobEmitter.on('error', (err: Error) => emitter.emit('error', err))
  jobEmitter.on('job', (job: Job) => {
    if (job.in == null || job.out == null) {
      emitter.emit('job', job)
      return
    }
    const inPath = (job.in as fs.ReadStream).path as string
    const outPath = job.out.path as string
    if (Object.hasOwn(outfileAssociations, outPath) && outfileAssociations[outPath] !== inPath) {
      emitter.emit(
        'error',
        new Error(`Output collision between '${inPath}' and '${outfileAssociations[outPath]}'`),
      )
    } else {
      outfileAssociations[outPath] = inPath
      emitter.emit('job', job)
    }
  })

  return emitter
}

function dismissStaleJobs(jobEmitter: EventEmitter): MyEventEmitter {
  const emitter = new MyEventEmitter()

  const jobsPromise = new JobsPromise()

  jobEmitter.on('end', () => jobsPromise.promise().then(() => emitter.emit('end')))
  jobEmitter.on('error', (err: Error) => emitter.emit('error', err))
  jobEmitter.on('job', (job: Job) => {
    if (job.in == null || job.out == null) return emitter.emit('job', job)

    const inPath = (job.in as fs.ReadStream).path as string
    jobsPromise.add(
      fsp
        .stat(inPath)
        .then((stats) => {
          const inM = stats.mtime
          const outM = job.out?.mtime ?? new Date(0)

          if (outM <= inM) emitter.emit('job', job)
        })
        .catch(() => {
          emitter.emit('job', job)
        }),
    )
  })

  return emitter
}

function makeJobEmitter(
  inputs: string[],
  {
    recursive,
    outstreamProvider,
    streamRegistry,
    watch: watchOption,
    reprocessStale,
  }: JobEmitterOptions,
): MyEventEmitter {
  const emitter = new EventEmitter()

  const emitterFns: (() => MyEventEmitter)[] = []
  const watcherFns: (() => MyEventEmitter)[] = []

  for (const input of inputs) {
    if (input === '-') {
      emitterFns.push(
        () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry }),
      )
      watcherFns.push(() => new NullJobEmitter())

      startEmitting()
    } else {
      fs.stat(input, (err, stats) => {
        if (err != null) return emitter.emit('error', err)
        if (stats.isDirectory()) {
          emitterFns.push(
            () =>
              new ReaddirJobEmitter({ dir: input, recursive, outstreamProvider, streamRegistry }),
          )
          watcherFns.push(
            () =>
              new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry }),
          )
        } else {
          emitterFns.push(
            () => new SingleJobEmitter({ file: input, outstreamProvider, streamRegistry }),
          )
          watcherFns.push(
            () =>
              new WatchJobEmitter({ file: input, recursive, outstreamProvider, streamRegistry }),
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

  function startEmitting(): void {
    if (inputs.length !== 0 && emitterFns.length !== inputs.length) return

    let source: MyEventEmitter = new MergedJobEmitter(...emitterFns.map((f) => f()))

    if (watchOption) {
      source = new ConcattedJobEmitter(
        () => source,
        () => new MergedJobEmitter(...watcherFns.map((f) => f())),
      )
    }

    source.on('job', (job: Job) => emitter.emit('job', job))
    source.on('error', (err: Error) => emitter.emit('error', err))
    source.on('end', () => emitter.emit('end'))
  }

  const stalefilter = reprocessStale ? (x: EventEmitter) => x as MyEventEmitter : dismissStaleJobs
  return stalefilter(detectConflicts(emitter))
}

export interface AssembliesCreateOptions {
  steps?: string
  template?: string
  fields?: Record<string, string>
  watch?: boolean
  recursive?: boolean
  inputs: string[]
  output?: string | null
  del?: boolean
  reprocessStale?: boolean
}

export default function run(
  outputctl: IOutputCtl,
  client: Transloadit,
  {
    steps,
    template,
    fields,
    watch: watchOption,
    recursive,
    inputs,
    output,
    del,
    reprocessStale,
  }: AssembliesCreateOptions,
): Promise<unknown[]> {
  // Quick fix for https://github.com/transloadit/transloadify/issues/13
  let resolvedOutput = output
  if (resolvedOutput == null && !process.stdout.isTTY) resolvedOutput = '-'

  return new Promise((resolve, reject) => {
    const params: CreateAssemblyParams = (
      steps
        ? { steps: JSON.parse(fs.readFileSync(steps).toString()) as CreateAssemblyParams['steps'] }
        : { template_id: template }
    ) as CreateAssemblyParams
    if (fields) {
      params.fields = fields
    }

    let outstat: StatLike | undefined

    if (resolvedOutput != null) {
      try {
        outstat = myStatSync(process.stdout, resolvedOutput)
      } catch (e) {
        const err = e as NodeJS.ErrnoException
        if (err.code !== 'ENOENT') throw e
        outstat = { isDirectory: () => false }
      }

      if (!outstat.isDirectory() && inputs.length !== 0) {
        const firstInput = inputs[0]
        if (
          inputs.length > 1 ||
          (firstInput && myStatSync(process.stdin, firstInput).isDirectory())
        ) {
          const msg = 'Output must be a directory when specifying multiple inputs'
          outputctl.error(msg)
          return reject(new Error(msg))
        }
      }
    }

    const outstreamProvider: OutstreamProvider =
      resolvedOutput == null
        ? nullProvider()
        : outstat?.isDirectory()
          ? dirProvider(resolvedOutput)
          : fileProvider(resolvedOutput)
    const streamRegistry: StreamRegistry = {}

    const emitter = makeJobEmitter(inputs, {
      recursive,
      watch: watchOption,
      outstreamProvider,
      streamRegistry,
      reprocessStale,
    })

    const jobsPromise = new JobsPromise()
    emitter.on('job', (job: Job) => {
      const inPath = job.in ? ((job.in as fs.ReadStream).path as string | undefined) : undefined
      const outPath = job.out?.path
      outputctl.debug(`GOT JOB ${inPath ?? 'null'} ${outPath ?? 'null'}`)

      let superceded = false
      if (job.out != null)
        job.out.on('finish', () => {
          superceded = true
        })

      const createOptions: CreateAssemblyOptions = { params }
      if (job.in != null) {
        createOptions.uploads = { in: job.in }
      }

      const jobPromise = (async () => {
        const result = await client.createAssembly(createOptions)
        if (superceded) return

        const assemblyId = result.assembly_id
        if (!assemblyId) throw new Error('No assembly_id in result')

        let assembly: AssemblyStatus = await client.getAssembly(assemblyId)

        while (
          assembly.ok !== 'ASSEMBLY_COMPLETED' &&
          assembly.ok !== 'ASSEMBLY_CANCELED' &&
          !assembly.error
        ) {
          if (superceded) return
          outputctl.debug(`Assembly status: ${assembly.ok}`)
          await new Promise((resolve) => setTimeout(resolve, 1000))
          assembly = await client.getAssembly(assemblyId)
        }

        if (assembly.error || (assembly.ok && assembly.ok !== 'ASSEMBLY_COMPLETED')) {
          const msg = `Assembly failed: ${assembly.error || assembly.message} (Status: ${assembly.ok})`
          outputctl.error(msg)
          throw new Error(msg)
        }

        if (!assembly.results) throw new Error('No results in assembly')
        const resultsKeys = Object.keys(assembly.results)
        const firstKey = resultsKeys[0]
        if (!firstKey) throw new Error('No results in assembly')
        const firstResult = assembly.results[firstKey]
        if (!firstResult || !firstResult[0]) throw new Error('No results in assembly')
        const resulturl = firstResult[0].url

        if (job.out != null && resulturl) {
          outputctl.debug('DOWNLOADING')
          await new Promise<void>((resolve, reject) => {
            const get = resulturl.startsWith('https') ? https.get : http.get
            get(resulturl, (res) => {
              if (res.statusCode !== 200) {
                const msg = `Server returned http status ${res.statusCode}`
                outputctl.error(msg)
                return reject(new Error(msg))
              }

              if (superceded) return resolve()

              res.pipe(job.out!)
              job.out?.on('finish', () => res.unpipe())
              res.on('end', () => resolve())
            }).on('error', (err) => {
              outputctl.error(err.message)
              reject(err)
            })
          })
        }
        await completeJob()
      })()

      jobsPromise.add(jobPromise)

      async function completeJob(): Promise<void> {
        const inPath = job.in ? ((job.in as fs.ReadStream).path as string | undefined) : undefined
        const outPath = job.out?.path
        outputctl.debug(`COMPLETED ${inPath ?? 'null'} ${outPath ?? 'null'}`)

        if (del && job.in != null && inPath) {
          await fsp.unlink(inPath)
        }
      }
    })

    jobsPromise.on('error', (err: Error) => {
      outputctl.error(err)
    })

    emitter.on('error', (err: Error) => {
      outputctl.error(err)
      reject(err)
    })

    emitter.on('end', () => {
      resolve(jobsPromise.promise())
    })
  })
}
