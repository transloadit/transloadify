import type { Transloadit } from 'transloadit'
import assembliesCreate from './assemblies-create.js'
import type { APIError } from './helpers.js'
import { createReadStream, formatAPIError, stream2buf } from './helpers.js'
import type { IOutputCtl } from './OutputCtl.js'

export const create = assembliesCreate

export interface AssemblyListOptions {
  before?: string
  after?: string
  fields?: string[]
  keywords?: string[]
  pagesize?: number
}

export interface AssemblyGetOptions {
  assemblies: string[]
}

export interface AssemblyDeleteOptions {
  assemblies: string[]
}

export interface AssemblyReplayOptions {
  fields?: Record<string, string>
  reparse?: boolean
  steps?: string
  notify_url?: string
  assemblies: string[]
}

export function list(
  output: IOutputCtl,
  client: Transloadit,
  { before, after, fields, keywords }: AssemblyListOptions,
): Promise<void> {
  const assemblies = client.streamAssemblies({
    fromdate: after,
    todate: before,
    keywords,
  })

  assemblies.on('readable', () => {
    const assembly = assemblies.read() as Record<string, unknown> | null
    if (assembly == null) return

    if (fields == null) {
      output.print(assembly.id as string, assembly)
    } else {
      output.print(fields.map((field) => assembly[field]).join(' '), assembly)
    }
  })

  return new Promise<void>((resolve) => {
    assemblies.on('end', resolve)
    assemblies.on('error', (err: unknown) => {
      output.error(formatAPIError(err as APIError))
      resolve()
    })
  })
}

export async function get(
  output: IOutputCtl,
  client: Transloadit,
  { assemblies }: AssemblyGetOptions,
): Promise<void> {
  for (const assembly of assemblies) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    try {
      const result = await client.getAssembly(assembly)
      output.print(result, result)
    } catch (err) {
      output.error(formatAPIError(err as APIError))
      throw err
    }
  }
}

async function _delete(
  output: IOutputCtl,
  client: Transloadit,
  { assemblies }: AssemblyDeleteOptions,
): Promise<void> {
  const promises = assemblies.map(async (assembly) => {
    try {
      await client.cancelAssembly(assembly)
    } catch (err) {
      output.error(formatAPIError(err as APIError))
    }
  })
  await Promise.all(promises)
}

export { _delete as delete }

export async function replay(
  output: IOutputCtl,
  client: Transloadit,
  { fields, reparse, steps, notify_url, assemblies }: AssemblyReplayOptions,
): Promise<void> {
  if (steps) {
    try {
      const buf = await new Promise<Buffer>((resolve, reject) => {
        stream2buf(createReadStream(steps), (err, buf) => {
          if (err) reject(err)
          else if (buf) resolve(buf)
          else reject(new Error('No buffer received'))
        })
      })
      await apiCall(JSON.parse(buf.toString()) as Record<string, unknown>)
    } catch (err) {
      const error = err as Error
      output.error(error.message || err)
    }
  } else {
    await apiCall()
  }

  async function apiCall(_steps?: Record<string, unknown>): Promise<void> {
    const promises = assemblies.map(async (assembly) => {
      try {
        await client.replayAssembly(assembly, {
          reparse_template: reparse ? 1 : 0,
          fields,
          notify_url,
        })
      } catch (err) {
        output.error(formatAPIError(err as APIError))
      }
    })
    await Promise.all(promises)
  }
}
