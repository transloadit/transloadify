import Q from 'q'
import { stream2buf, createReadStream, inSequence, formatAPIError } from './helpers'
import fs from 'fs'
import path from 'path'
import rreaddir from 'recursive-readdir'
import ModifiedLookup from './template-last-modified'

export function create (output, client, { name, file }) {
  stream2buf(createReadStream(file), (err, buf) => {
    if (err) return output.error(err.message)

    client.createTemplate({ name, template: buf.toString() }, (err, result) => {
      if (err) return output.error(err.message)
      output.print(result.id, result)
    })
  })
}

export function get (output, client, { templates }) {
  let requests = templates.map(template => {
    let deferred = Q.defer()

    client.getTemplate(template, (err, result) => {
      if (err) deferred.reject(err)
      else deferred.resolve(result)
    })

    return deferred.promise
  })

  inSequence(requests, result => {
    output.print(result, result)
  }, err => {
    output.error(formatAPIError(err))
  })
}

export function modify (output, client, { template, name, file }) {
  stream2buf(createReadStream(file), (err, buf) => {
    if (err) return output.error(err.message)

    let promise = (name && buf.length !== 0)
            ? Q.fcall(() => ({ name, json: buf.toString() }))
            : Q.nfcall(client.getTemplate.bind(client), template)
                .then(template => ({
                  name: name || template.name,
                  json: buf.length !== 0 ? buf.toString() : template.content
                }))

    promise
            .then(({ name, json }) => {
              client.editTemplate(template, { name, template: json }, (err, result) => {
                if (err) return output.error(formatAPIError(err))
              })
            })
            .fail(err => output.error(formatAPIError(err)))
  })
}

exports['delete'] = function _delete (output, client, { templates }) {
  for (let template of templates) {
    client.deleteTemplate(template, err => {
      if (err) output.error(formatAPIError(err))
    })
  }
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
  const flatten = Array.prototype.concat.apply

    // Promise [String] -- all files in the directory tree
  let relevantFiles = Q.all(
        files.map(file => Q.Promise((resolve, reject) => {
          fs.stat(file, (err, stats) => {
            if (err) return reject(err)
            if (!stats.isDirectory()) return resolve([file])
            resolve(
                    Q.nfcall(recursive ? rreaddir : fs.readdir, file)
                    .then(children => children.map(child => path.join(file, child))))
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
            .then(stats => stats.mtime.valueOf())

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

        template.data.steps = result.content.steps
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
  })
}
