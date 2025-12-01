import assembliesCreate from './assemblies-create.js'
import { createReadStream, formatAPIError, stream2buf } from './helpers.js'

export const create = assembliesCreate

export function list(output, client, { before, after, fields, keywords }) {
  const assemblies = client.streamAssemblies({
    fromdate: after,
    todate: before,
    fields,
    keywords,
  })

  assemblies.on('readable', () => {
    const assembly = assemblies.read()
    if (assembly == null) return

    if (fields == null) {
      output.print(assembly.id, assembly)
    } else {
      output.print(fields.map((field) => assembly[field]).join(' '), assembly)
    }
  })

  return new Promise((resolve, _reject) => {
    assemblies.on('end', resolve)
    assemblies.on('error', (err) => {
      output.error(formatAPIError(err))
      // Resolve anyway so CLI doesn't hang, error is logged
      resolve()
    })
  })
}

export async function get(output, client, { assemblies }) {
  // We are still returning a deferred promise for compatibility or just a promise
  // But we can use async/await internally.

  for (const assembly of assemblies) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    try {
      const result = await client.getAssembly(assembly)
      output.print(result, result)
    } catch (err) {
      output.error(formatAPIError(err))
      throw err
    }
  }
}

async function _delete(output, client, { assemblies }) {
  const promises = assemblies.map(async (assembly) => {
    try {
      await client.cancelAssembly(assembly)
    } catch (err) {
      output.error(formatAPIError(err))
    }
  })
  await Promise.all(promises)
}

export { _delete as delete }

export async function replay(output, client, { fields, reparse, steps, notify_url, assemblies }) {
  if (steps) {
    try {
      const buf = await new Promise((resolve, reject) => {
        stream2buf(createReadStream(steps), (err, buf) => {
          if (err) reject(err)
          else resolve(buf)
        })
      })
      await apiCall(JSON.parse(buf.toString()))
    } catch (err) {
      output.error(err.message || err)
    }
  } else {
    await apiCall()
  }

  async function apiCall(steps) {
    const promises = assemblies.map(async (assembly) => {
      try {
        await client.replayAssembly(assembly, {
          reparse_template: reparse,
          fields,
          steps,
          notify_url,
        })
      } catch (err) {
        output.error(formatAPIError(err))
      }
    })
    await Promise.all(promises)
  }
}
