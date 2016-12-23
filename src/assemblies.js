import Q from 'q'
import { stream2buf, createReadStream, inSequence, formatAPIError } from './helpers'
import assembliesCreate from './assemblies-create'

export const create = assembliesCreate

export function list (output, client, { before, after, fields, keywords }) {
  let assemblies = client.streamAssemblies({
    fromdate: after,
    todate: before,
    fields,
    keywords
  })

  assemblies.on('readable', () => {
    let assembly = assemblies.read()
    if (assembly == null) return

    if (fields == null) {
      output.print(assembly.id, assembly)
    } else {
      output.print(fields.map(field => assembly[field]).join(' '), assembly)
    }
  })

  assemblies.on('error', err => {
    output.error(formatAPIError(err))
  })
}

export function get (output, client, { assemblies }) {
  let deferred = Q.defer()

  let requests = assemblies.map(assembly => {
    let deferred = Q.defer()

    client.getAssembly(assembly, (err, result) => {
      if (err) deferred.reject(err)
      else deferred.resolve(result)
    })

    return deferred.promise
  })

  inSequence(requests, result => {
    output.print(result, result)
  }, err => {
    output.error(formatAPIError(err))
  }).then(deferred.resolve.bind(deferred))

  return deferred.promise
}

exports['delete'] = function _delete (output, client, { assemblies }) {
  for (let assembly of assemblies) {
    client.deleteAssembly(assembly, err => {
      if (err) output.error(formatAPIError(err))
    })
  }
}

export function replay (output, client, { fields, reparse, steps, notify_url, assemblies }) {
  if (steps) {
    stream2buf(createReadStream(steps), (err, buf) => {
      if (err) return output.error(err.message)

      apiCall(JSON.parse(buf.toString()))
    })
  } else {
    apiCall()
  }

  function apiCall (steps) {
    for (let assembly of assemblies) {
      client.replayAssembly({
        assembly_id: assembly,
        reparse_template: reparse,
        fields,
        steps,
        notify_url
      }, (err, result) => {
        if (err) return output.error(formatAPIError(err))
      })
    }
  }
}
