import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import rreaddir from 'recursive-readdir'
import { createReadStream, formatAPIError, stream2buf } from './helpers.js'
import ModifiedLookup from './template-last-modified.js'

const rreaddirAsync = promisify(rreaddir)
const statAsync = promisify(fs.stat)
const readdirAsync = promisify(fs.readdir)
const readFileAsync = promisify(fs.readFile)
const writeFileAsync = promisify(fs.writeFile)
const renameAsync = promisify(fs.rename)

export async function create(output, client, { name, file }) {
  try {
    const buf = await new Promise((resolve, reject) => {
      stream2buf(createReadStream(file), (err, buf) => {
        if (err) reject(err)
        else resolve(buf)
      })
    })

    const result = await client.createTemplate({ name, template: buf.toString() })
    output.print(result.id, result)
    return result
  } catch (err) {
    output.error(err.message)
    throw err
  }
}

export async function get(output, client, { templates }) {
  const requests = templates.map((template) => client.getTemplate(template))

  try {
    const results = await Promise.all(requests)
    for (const result of results) {
      output.print(result, result)
    }
  } catch (err) {
    output.error(formatAPIError(err))
    throw err
  }
}

export async function modify(output, client, { template, name, file }) {
  try {
    const buf = await new Promise((resolve, reject) => {
      stream2buf(createReadStream(file), (err, buf) => {
        if (err) reject(err)
        else resolve(buf)
      })
    })

    let json = buf.toString()
    let newName = name

    if (!name || buf.length === 0) {
      const tpl = await client.getTemplate(template)
      if (!name) newName = tpl.name
      if (buf.length === 0) json = tpl.content
    }

    await client.editTemplate(template, { name: newName, template: json })
  } catch (err) {
    output.error(formatAPIError(err))
    throw err
  }
}

async function _delete(output, client, { templates }) {
  await Promise.all(
    templates.map(async (template) => {
      try {
        await client.deleteTemplate(template)
      } catch (err) {
        output.error(formatAPIError(err))
        throw err
      }
    }),
  )
}
export { _delete as delete }

export function list(output, client, { before, after, order, sort, fields }) {
  const stream = client.streamTemplates({
    todate: before,
    fromdate: after,
    order,
    sort,
    fields,
  })

  stream.on('readable', () => {
    const template = stream.read()
    if (template == null) return

    if (fields == null) {
      output.print(template.id, template)
    } else {
      output.print(fields.map((field) => template[field]).join(' '), template)
    }
  })

  stream.on('error', (err) => {
    output.error(formatAPIError(err))
  })
}

export async function sync(output, client, { files, recursive }) {
  // Promise [String] -- all files in the directory tree
  const relevantFilesNested = await Promise.all(
    files.map(async (file) => {
      const stats = await statAsync(file)
      if (!stats.isDirectory()) return [file]

      let children
      if (recursive) {
        children = await rreaddirAsync(file)
      } else {
        const list = await readdirAsync(file)
        children = list.map((child) => path.join(file, child))
      }

      if (recursive) return children

      // Filter directories if not recursive
      const filtered = await Promise.all(
        children.map(async (child) => {
          const childStats = await statAsync(child)
          return childStats.isDirectory() ? null : child
        }),
      )
      return filtered.filter((f) => f !== null)
    }),
  )
  const relevantFiles = relevantFilesNested.flat()

  // Promise [{ file: String, data: JSON }] -- all templates
  const maybeFiles = await Promise.all(relevantFiles.map(templateFileOrNull))
  const templates = maybeFiles.filter((maybeFile) => maybeFile !== null)

  async function templateFileOrNull(file) {
    if (path.extname(file) !== '.json') return null

    try {
      const data = await readFileAsync(file)
      const json = JSON.parse(data)
      return 'transloadit_template_id' in json ? { file, data: json } : null
    } catch (e) {
      if (e instanceof SyntaxError) return null
      throw e
    }
  }

  const modified = new ModifiedLookup(client)

  try {
    await Promise.all(
      templates.map(async (template) => {
        if (!('steps' in template.data)) {
          if (!template.data.transloadit_template_id) {
            throw new Error(`Template file has no id and no steps: ${template.file}`)
          }
          return download(template)
        }

        if (!template.data.transloadit_template_id) return upload(template)

        const stats = await statAsync(template.file)
        const fileModified = stats.mtime

        let templateModified
        try {
          await client.getTemplate(template.data.transloadit_template_id)
          templateModified = await new Promise((resolve, reject) =>
            modified.byId(template.data.transloadit_template_id, (err, res) =>
              err ? reject(err) : resolve(res),
            ),
          )
        } catch (err) {
          if (err.code === 'SERVER_404' || (err.response && err.response.statusCode === 404)) {
            throw new Error(`Template file references nonexistent template: ${template.file}`)
          }
          throw err
        }

        if (fileModified > templateModified) return upload(template)
        return download(template)
      }),
    )
  } catch (err) {
    output.error(err)
    throw err
  }

  async function upload(template) {
    const params = {
      name: path.basename(template.file, '.json'),
      template: JSON.stringify(template.data.steps),
    }

    if (!template.data.transloadit_template_id) {
      const result = await client.createTemplate(params)
      template.data.transloadit_template_id = result.id
      await writeFileAsync(template.file, JSON.stringify(template.data))
      return
    }

    await client.editTemplate(template.data.transloadit_template_id, params)
  }

  async function download(template) {
    const result = await client.getTemplate(template.data.transloadit_template_id)

    template.data.steps = result.content
    const file = path.join(path.dirname(template.file), `${result.name}.json`)

    await writeFileAsync(template.file, JSON.stringify(template.data))

    if (file !== template.file) {
      await renameAsync(template.file, file)
    }
  }
}
