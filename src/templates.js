import Q from 'q'
import { stream2buf, createReadStream, inSequence, formatAPIError } from './helpers'
import fs from 'fs'
import path from 'path'
import rreaddir from 'recursive-readdir'
import ModifiedLookup from './template-last-modified'

export function create (output, client, { name, file }) {
  let deferred = Q.defer()

  stream2buf(createReadStream(file), (err, buf) => {
    if (err) {
      output.error(err.message)
      return deferred.reject(err)
    }

    client.createTemplate({ name, template: buf.toString() }, (err, result) => {
      if (err) {
        output.error(err.message)
        return deferred.reject(err)
      }

      output.print(result.id, result)
      deferred.resolve(result)
    })
  })

  return deferred.promise
}

export function get (output, client, { templates }) {
  let deferred = Q.defer()

  let requests = templates.map(template => {
    return Q.nfcall(client.getTemplate.bind(client), template)
  })

  inSequence(requests, result => {
    output.print(result, result)
  }, err => {
    output.error(formatAPIError(err))
    deferred.reject(err)
  }).then(deferred.resolve.bind(deferred))

  return deferred.promise
}

export function modify (output, client, { template, name, file }) {
  let deferred = Q.defer()

  stream2buf(createReadStream(file), (err, buf) => {
    if (err) {
      output.error(err.message)
      return Q.reject(err)
    }

    let promise = (name && buf.length !== 0)
            ? Q.fcall(() => ({ name, json: buf.toString() }))
            : Q.nfcall(client.getTemplate.bind(client), template)
                .then(template => ({
                  name: name || template.name,
                  json: buf.length !== 0 ? buf.toString() : template.content
                }))

    deferred.resolve(promise
            .then(({ name, json }) => {
              client.editTemplate(template, { name, template: json }, (err, result) => {
                if (err) return output.error(formatAPIError(err))
              })
            })
            .fail(err => {
              output.error(formatAPIError(err))
              throw err
            }))
  })

  return deferred.promise
}

exports['delete'] = function _delete (output, client, { templates }) {
  return Q.all(templates.map(template => {
    return Q.nfcall(client.deleteTemplate.bind(client), template)
      .fail(err => {
        output.error(formatAPIError(err))
        throw err
      })
  }))
}

export function list (output, client, { before, after, order, sort, fields }) {
  let stream = client.streamTemplates({
    todate: before,
    fromdate: after,
    order,
    sort,
    fields
  })

  stream.on('readable', () => {
    let template = stream.read()
    if (template == null) return

    if (fields == null) {
      output.print(template.id, template)
    } else {
      output.print(fields.map(field => template[field]).join(' '), template)
    }
  })

  stream.on('error', err => {
    output.error(formatAPIError(err))
  })
}

export function sync (output, client, { files, recursive }) {
  const flatten = Function.prototype.apply.bind(Array.prototype.concat, [])

  // Promise [String] -- all files in the directory tree
  let relevantFiles = Q.all(
        files.map(file => Q.Promise((resolve, reject) => {
          fs.stat(file, (err, stats) => {
            if (err) return reject(err)

            if (!stats.isDirectory()) return resolve([file])

            let children = Q.nfcall(recursive ? rreaddir : fs.readdir, file)
              // .then(children => children.map(child => path.join(file, child)))

            // omit subdirectories from fs.readdir results
            if (!recursive) {
              children = children.then(children => Q.all(
                children.map(child => Q.Promise((resolve, reject) => {
                  fs.stat(child, (err, stats) => {
                    if (err) return reject(err)
                    if (!stats.isDirectory()) return resolve(child)
                    resolve()
                  })
                })))
                .then(children => children.filter(child => child != null)))
            }

            resolve(children)
          })
        })))
        .then(flatten)

  // Promise [{ file: String, data: JSON }] -- all templates
  let templates = relevantFiles.then(
        files => Q.all(files.map(templateFileOrNull))
                 .then(maybeFiles => maybeFiles.filter(maybeFile => maybeFile !== null)))

  function templateFileOrNull (file) {
    if (path.extname(file) !== '.json') return Q.fcall(() => null)

    return Q.nfcall(fs.readFile, file)
            .then(JSON.parse)
            .then(data => 'transloadit_template_id' in data ? { file, data } : null)
            .fail(err => {
              if (err instanceof SyntaxError) return null
              throw err
            })
  }

  let modified = new ModifiedLookup(client)
  let complete = templates.then(templates => Q.all(templates.map(template => {
    if (!('steps' in template.data)) {
      if (!template.data.transloadit_template_id) {
        throw new Error(`Template file has no id and no steps: ${template.file}`)
      }

      return download(template)
    }

    if (!template.data.transloadit_template_id) return upload(template)

    let fileModified =
            Q.nfcall(fs.stat, template.file)
            .then(stats => stats.mtime)

    let templateModified =
            Q.nfcall(client.getTemplate.bind(client),
                     template.data.transloadit_template_id)
            .then(() => Q.nfcall(modified.byId.bind(modified),
                                 template.data.transloadit_template_id))
            .fail(err => {
              if (err.code === 'SERVER_404') {
                throw new Error(`Template file references nonexistent template: ${template.file}`)
              }
              throw err
            })

    return Q.spread([fileModified, templateModified], (fileModified, templateModified) => {
      if (fileModified > templateModified) return upload(template)
      return download(template)
    })
  })))

  function upload (template) {
    return new Promise((resolve, reject) => {
      let params = {
        name: path.basename(template.file, '.json'),
        template: JSON.stringify(template.data.steps)
      }

      if (!template.data.transloadit_template_id) {
        return client.createTemplate(params, (err, result) => {
          if (err) return reject(err)
          template.data.transloadit_template_id = result.id
          fs.writeFile(template.file, JSON.stringify(template.data), err => {
            if (err) return reject(err)
            resolve()
          })
        })
      }

      client.editTemplate(template.data.transloadit_template_id, params, err => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  function download (template) {
    return new Promise((resolve, reject) => {
      client.getTemplate(template.data.transloadit_template_id, (err, result) => {
        if (err) return reject(err)

        template.data.steps = result.content
        let file = path.join(path.dirname(template.file), result.name + '.json')

        fs.writeFile(template.file, JSON.stringify(template.data), err => {
          if (err) return reject(err)
          if (file === template.file) return resolve()

          fs.rename(template.file, file, err => {
            if (err) return reject(err)
            resolve()
          })
        })
      })
    })
  }

  complete.fail(err => {
    output.error(err)
    throw err
  })

  return complete
}
