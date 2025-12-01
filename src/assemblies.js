import Q from 'q'
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

export function get(output, client, { assemblies }) {
  const deferred = Q.defer()

  let promise = Q.resolve()

  for (const assembly of assemblies) {
    promise = promise.then(() => {
      return Q.delay(1000)
        .then(() => Q.resolve(client.getAssembly(assembly)))
        .then((result) => {
          output.print(result, result)
        })
    })
  }

  promise.then(deferred.resolve.bind(deferred)).catch((err) => {
    output.error(formatAPIError(err))
    deferred.reject(err)
  })

  return deferred.promise
}

function _delete(output, client, { assemblies }) {
  return Q.all(
    assemblies.map((assembly) => {
      return client.cancelAssembly(assembly).catch((err) => {
        output.error(formatAPIError(err))
      })
    }),
  )
}

export { _delete as delete }

export function replay(output, client, { fields, reparse, steps, notify_url, assemblies }) {
  if (steps) {
    const deferred = Q.defer()
    stream2buf(createReadStream(steps), (err, buf) => {
      if (err) {
        output.error(err.message)
        return deferred.reject(err)
      }

      deferred.resolve(apiCall(JSON.parse(buf.toString())))
    })
    return deferred.promise
  }
  return apiCall()

  function apiCall(steps) {
    return Q.all(
      assemblies.map((assembly) => {
        return client
          .replayAssembly(assembly, {
            reparse_template: reparse,
            fields,
            steps,
            notify_url,
          })
          .catch((err) => {
            return output.error(formatAPIError(err))
          })
      }),
    )
  }
}
