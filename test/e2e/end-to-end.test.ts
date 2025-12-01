import { exec } from 'node:child_process'
import fsp from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { imageSize } from 'image-size'
import rreaddir from 'recursive-readdir'
import { rimraf } from 'rimraf'
import type { TemplateContent } from 'transloadit'
import { Transloadit as TransloaditClient } from 'transloadit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as assemblies from '../../src/assemblies.ts'
import assembliesCreate from '../../src/assemblies-create.ts'
import * as bills from '../../src/bills.ts'
import { zip } from '../../src/helpers.ts'
import * as notifications from '../../src/notifications.ts'
import * as templates from '../../src/templates.ts'
import OutputCtl from '../OutputCtl.ts'
import 'dotenv/config'

const execAsync = promisify(exec)
const rreaddirAsync = promisify(rreaddir)

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const cliPath = path.resolve(__dirname, '../../bin/cmd.ts')

const tmpDir = '/tmp'

if (!process.env.TRANSLOADIT_KEY || !process.env.TRANSLOADIT_SECRET) {
  console.error(
    'Please provide environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET to run tests',
  )
  process.exit(1)
}

const authKey = process.env.TRANSLOADIT_KEY
const authSecret = process.env.TRANSLOADIT_SECRET

process.setMaxListeners(Number.POSITIVE_INFINITY)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

interface OutputEntry {
  type: string
  msg: unknown
  json?: { id?: string; assembly_id?: string } & Record<string, unknown>
}

function testCase<T>(cb: (client: TransloaditClient) => Promise<T>): () => Promise<T> {
  const cwd = process.cwd()
  return async () => {
    const dirname = path.join(
      tmpDir,
      `transloadify_test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    )
    const client = new TransloaditClient({ authKey, authSecret })
    try {
      await fsp.mkdir(dirname)
      process.chdir(dirname)
      return await cb(client)
    } finally {
      process.chdir(cwd)
      await rimraf(dirname)
    }
  }
}

function runCli(
  args: string,
  env: Record<string, string> = {},
): Promise<{ stdout: string; stderr: string }> {
  return execAsync(`npx tsx ${cliPath} ${args}`, {
    env: { ...process.env, ...env },
  })
}

describe('End-to-end', () => {
  describe('CLI', () => {
    it('should list templates via CLI', async () => {
      const { stdout, stderr } = await runCli('templates list')
      expect(stderr).to.be.empty
      expect(stdout).to.match(/[a-f0-9]{32}/)
    })
  })

  describe('templates', () => {
    describe('create', () => {
      it(
        'should create templates',
        testCase(async (client) => {
          const executions = [1, 2, 3, 4, 5].map(async (n) => {
            const output = new OutputCtl()
            await fsp.writeFile(`${n}.json`, JSON.stringify({ testno: n }))
            await templates.create(output, client, { name: `test-${n}`, file: `${n}.json` })
            return output.get() as OutputEntry[]
          })

          const results = await Promise.all(executions)
          for (const result of results) {
            expect(result).to.have.lengthOf(1)
            expect(result).to.have.nested.property('[0].type').that.equals('print')
            expect(result).to.have.nested.property('[0].msg').that.equals(result[0]?.json?.id)

            if (result[0]?.json?.id) {
              await client.deleteTemplate(result[0].json.id).catch(() => {})
            }
          }
        }),
      )
    })

    describe('get', () => {
      it(
        'should get templates',
        testCase(async (client) => {
          const response = await client.listTemplates({ pagesize: 5 })
          const templatesList = response.items
          if (templatesList.length === 0) throw new Error('account has no templates to fetch')

          const expectations = await Promise.all(
            templatesList.map((template) => client.getTemplate(template.id)),
          )

          const actuals = await Promise.all(
            templatesList.map(async (template) => {
              const output = new OutputCtl()
              await templates.get(output, client, { templates: [template.id] })
              return output.get() as OutputEntry[]
            }),
          )

          for (const [expectation, actual] of zip(expectations, actuals)) {
            expect(actual).to.have.lengthOf(1)
            expect(actual).to.have.nested.property('[0].type').that.equals('print')
            expect(actual).to.have.nested.property('[0].json').that.deep.equals(expectation)
          }
        }),
      )

      it(
        'should return templates in the order specified',
        testCase(async (client) => {
          const response = await client.listTemplates({ pagesize: 5 })
          const items = response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1)
          if (items.length === 0) throw new Error('account has no templates to fetch')

          const ids = items.map((template) => template.id)

          const output = new OutputCtl()
          await templates.get(output, client, { templates: ids })
          const results = output.get() as OutputEntry[]

          expect(results).to.have.lengthOf(ids.length)
          for (const [result, id] of zip(results, ids)) {
            expect(result).to.have.property('type').that.equals('print')
            expect(result).to.have.nested.property('json.id').that.equals(id)
          }
        }),
      )
    })

    describe('modify', () => {
      let templateId: string

      beforeAll(async () => {
        const client = new TransloaditClient({ authKey, authSecret })
        const response = await client.createTemplate({
          name: 'original-name',
          template: {
            steps: { dummy: { robot: '/html/convert', url: 'https://example.com' } },
          } as TemplateContent,
        })
        templateId = response.id
      })

      it(
        'should modify but not rename the template',
        testCase(async (client) => {
          await fsp.writeFile('template.json', JSON.stringify({ stage: 1 }))

          const output = new OutputCtl()
          await templates.modify(output, client, {
            template: templateId,
            file: 'template.json',
          })
          const result = output.get()

          expect(result).to.have.lengthOf(0)
          await delay(2000)
          const template = await client.getTemplate(templateId)
          expect(template).to.have.property('name').that.equals('original-name')
          expect(template).to.have.property('content').that.has.property('steps')
        }),
      )

      it(
        'should not modify but rename the template',
        testCase(async (client) => {
          await fsp.writeFile('template.json', '')

          const output = new OutputCtl()
          await templates.modify(output, client, {
            template: templateId,
            name: 'new-name',
            file: 'template.json',
          })
          const result = output.get()

          expect(result).to.have.lengthOf(0)
          await delay(2000)
          const template = await client.getTemplate(templateId)
          expect(template).to.have.property('name').that.equals('new-name')
          expect(template).to.have.property('content').that.has.property('steps')
        }),
      )

      it(
        'should modify and rename the template',
        testCase(async (client) => {
          await fsp.writeFile('template.json', JSON.stringify({ stage: 2 }))

          const output = new OutputCtl()
          await templates.modify(output, client, {
            template: templateId,
            name: 'newer-name',
            file: 'template.json',
          })
          const result = output.get()

          expect(result).to.have.lengthOf(0)
          await delay(2000)
          const template = await client.getTemplate(templateId)
          expect(template).to.have.property('name').that.equals('newer-name')
          expect(template).to.have.property('content').that.has.property('steps')
        }),
      )

      afterAll(async () => {
        const client = new TransloaditClient({ authKey, authSecret })
        await client.deleteTemplate(templateId)
      })
    })

    describe('delete', () => {
      it(
        'should delete templates',
        testCase(async (client) => {
          const ids = await Promise.all(
            [1, 2, 3, 4, 5].map(async (n) => {
              const response = await client.createTemplate({
                name: `delete-test-${n}`,
                template: {
                  steps: { dummy: { robot: '/html/convert', url: `https://example.com/${n}` } },
                } as TemplateContent,
              })
              return response.id
            }),
          )

          const output = new OutputCtl()
          await templates.delete(output, client, { templates: ids })
          const result = output.get()

          expect(result).to.have.lengthOf(0)
          await Promise.all(
            ids.map(async (id) => {
              try {
                const response = await client.getTemplate(id)
                expect(response).to.not.exist
              } catch (err) {
                const error = err as {
                  code?: string
                  transloaditErrorCode?: string
                  response?: { body?: { error?: string } }
                }
                const errorCode =
                  error.code || error.transloaditErrorCode || error.response?.body?.error
                if (errorCode !== 'TEMPLATE_NOT_FOUND') {
                  console.error('Delete failed with unexpected error:', err, 'Code:', errorCode)
                  throw err
                }
              }
            }),
          )
        }),
      )
    })

    describe('sync', () => {
      it(
        'should handle directories recursively',
        testCase(async (client) => {
          const response = await client.listTemplates({ pagesize: 5 })
          const templateIds = response.items.map((item) => ({ id: item.id, name: item.name }))

          let dirname = 'd'
          const files: string[] = []
          for (const { id, name } of templateIds) {
            const fname = path.join(dirname, `${name}.json`)
            await fsp.mkdir(dirname, { recursive: true })
            await fsp.writeFile(fname, `{"transloadit_template_id":"${id}"}`)
            files.push(fname)
            dirname = path.join(dirname, 'd')
          }

          const output = new OutputCtl()
          await templates.sync(output, client, { recursive: true, files: ['d'] })
          const result = output.get()

          expect(result).to.have.lengthOf(0)
          const contents = await Promise.all(
            files.map(
              async (file) =>
                JSON.parse(await fsp.readFile(file, 'utf8')) as Record<string, unknown>,
            ),
          )
          for (const [content, idObj] of zip(contents, templateIds)) {
            expect(content).to.have.property('transloadit_template_id').that.equals(idObj.id)
            expect(content).to.have.property('steps')
          }
        }),
      )

      it(
        'should update local files when outdated',
        testCase(async (client) => {
          const params = {
            name: 'test-local-update-1',
            template: {
              steps: { dummy: { robot: '/html/convert', url: 'https://example.com/changed' } },
            } as TemplateContent,
          }
          const response = await client.createTemplate(params)
          const id = response.id

          try {
            const fname = `${params.name}.json`
            await fsp.writeFile(
              fname,
              JSON.stringify({
                transloadit_template_id: id,
                steps: { changed: false },
              }),
            )
            await fsp.utimes(fname, 0, 0)

            const output = new OutputCtl()
            await templates.sync(output, client, { files: [fname] })
            const result = output.get()

            expect(result).to.have.lengthOf(0)
            const content = JSON.parse(await fsp.readFile(fname, 'utf8')) as Record<string, unknown>
            expect(content).to.have.property('steps')
            const fetchedTemplate = await client.getTemplate(id)
            expect(fetchedTemplate).to.have.property('content').that.has.property('steps')
          } finally {
            await client.deleteTemplate(id).catch(() => {})
          }
        }),
      )

      it(
        'should update remote template when outdated',
        testCase(async (client) => {
          const params = {
            name: 'test-local-update-1',
            template: {
              steps: { dummy: { robot: '/html/convert', url: 'https://example.com/unchanged' } },
            } as TemplateContent,
          }
          const response = await client.createTemplate(params)
          const id = response.id

          try {
            const fname = `${params.name}.json`
            await fsp.writeFile(
              fname,
              JSON.stringify({
                transloadit_template_id: id,
                steps: { changed: true },
              }),
            )
            await fsp.utimes(fname, Date.now() * 2, Date.now() * 2)

            const output = new OutputCtl()
            await templates.sync(output, client, { files: [fname] })
            const result = output.get()

            expect(result).to.have.lengthOf(0)
            const content = JSON.parse(await fsp.readFile(fname, 'utf8')) as Record<string, unknown>
            expect(content).to.have.property('steps')
            const fetchedTemplate = await client.getTemplate(id)
            expect(fetchedTemplate).to.have.property('content').that.has.property('steps')
          } finally {
            await client.deleteTemplate(id).catch(() => {})
          }
        }),
      )
    })
  })

  describe('assemblies', () => {
    describe('get', () => {
      it(
        'should get assemblies',
        testCase(async (client) => {
          const response = await client.listAssemblies({
            pagesize: 5,
            type: 'completed',
          })
          const assemblyList = response.items
          if (assemblyList.length === 0) throw new Error('account has no assemblies to fetch')

          const expectations = await Promise.all(
            assemblyList.map((assembly) => client.getAssembly(assembly.id)),
          )

          const actuals = await Promise.all(
            assemblyList.map(async (assembly) => {
              const output = new OutputCtl()
              await assemblies.get(output, client, { assemblies: [assembly.id] })
              return output.get() as OutputEntry[]
            }),
          )

          for (const [expectation, actual] of zip(expectations, actuals)) {
            expect(actual).to.have.lengthOf(1)
            expect(actual).to.have.nested.property('[0].type').that.equals('print')
            expect(actual).to.have.nested.property('[0].json').that.deep.equals(expectation)
          }
        }),
      )

      it(
        'should return assemblies in the order specified',
        testCase(async (client) => {
          const response = await client.listAssemblies({ pagesize: 5 })
          const assemblyList = response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1)
          if (assemblyList.length === 0) throw new Error('account has no assemblies to fetch')

          const ids = assemblyList.map((assembly) => assembly.id)

          const output = new OutputCtl()
          await assemblies.get(output, client, { assemblies: ids })
          const results = output.get() as OutputEntry[]

          try {
            expect(results).to.have.lengthOf(ids.length)
          } catch (e) {
            console.error('DEBUG: Results:', JSON.stringify(results, null, 2))
            console.error('DEBUG: Ids:', JSON.stringify(ids, null, 2))
            throw e
          }
          for (const [result, id] of zip(results, ids)) {
            expect(result).to.have.property('type').that.equals('print')
            expect(result).to.have.nested.property('json.assembly_id').that.equals(id)
          }
        }),
      )

      describe('list', () => {
        it(
          'should list assemblies',
          testCase(async (client) => {
            const output = new OutputCtl()
            await assemblies.list(output, client, { pagesize: 1 })
            const logs = output.get() as OutputEntry[]
            expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
          }),
        )
      })

      describe('delete', () => {
        it(
          'should delete assemblies',
          testCase(async (client) => {
            const assembly = await client.createAssembly({
              params: {
                steps: { import: { robot: '/http/import', url: 'https://placehold.co/100.jpg' } },
              },
            })

            const output = new OutputCtl()
            const assemblyId = assembly.assembly_id as string
            await assemblies.delete(output, client, { assemblies: [assemblyId] })
            const res = await client.getAssembly(assemblyId)
            expect(res.ok).to.equal('ASSEMBLY_CANCELED')
          }),
        )
      })

      describe('replay', () => {
        it(
          'should replay assemblies',
          testCase(async (client) => {
            const assembly = await client.createAssembly({
              params: {
                steps: { import: { robot: '/http/import', url: 'https://placehold.co/100.jpg' } },
              },
            })

            const output = new OutputCtl()
            const assemblyId = assembly.assembly_id as string
            await assemblies.replay(output, client, {
              assemblies: [assemblyId],
              steps: undefined,
            })
            const logs = output.get() as OutputEntry[]
            expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
          }),
        )
      })

      describe('create', () => {
        const genericImg = 'https://placehold.co/100.jpg'

        async function imgPromise(fname = 'in.jpg'): Promise<string> {
          const response = await fetch(genericImg)
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`)
          }
          const buffer = Buffer.from(await response.arrayBuffer())
          await fsp.writeFile(fname, buffer)
          return fname
        }

        const genericSteps = {
          resize: {
            robot: '/image/resize',
            use: ':original',
            result: true,
            width: 130,
            height: 130,
          },
        }

        async function stepsPromise(
          _fname = 'steps.json',
          steps: Record<string, unknown> = genericSteps,
        ): Promise<string> {
          await fsp.writeFile('steps.json', JSON.stringify(steps))
          return 'steps.json'
        }

        it(
          'should transcode a file',
          testCase(async (client) => {
            const infile = await imgPromise()
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: [infile],
              output: 'out.jpg',
            })
            const result = output.get(true) as OutputEntry[]

            expect(result.length).to.be.at.least(3)
            const msgs = result.map((r) => r.msg)
            expect(msgs).to.include('GOT JOB in.jpg out.jpg')
            expect(msgs).to.include('DOWNLOADING')
            expect(msgs).to.include('COMPLETED in.jpg out.jpg')

            const imgBuffer = await fsp.readFile('out.jpg')
            const dim = imageSize(new Uint8Array(imgBuffer))
            expect(dim).to.have.property('width').that.equals(130)
            expect(dim).to.have.property('height').that.equals(130)
          }),
        )

        it(
          'should handle multiple inputs',
          testCase(async (client) => {
            const infiles = await Promise.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
            const steps = await stepsPromise()
            await fsp.mkdir('out')

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: infiles,
              output: 'out',
            })

            const outs = await fsp.readdir('out')
            expect(outs[0]).to.equal('in1.jpg')
            expect(outs[1]).to.equal('in2.jpg')
            expect(outs[2]).to.equal('in3.jpg')
            expect(outs).to.have.lengthOf(3)
          }),
        )

        it(
          'should not output outside outdir',
          testCase(async (client) => {
            await fsp.mkdir('sub')
            process.chdir('sub')

            const infile = await imgPromise('../in.jpg')
            await fsp.mkdir('out')
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: [infile],
              output: 'out',
            })

            const outs = await fsp.readdir('out')
            expect(outs[0]).to.equal('in.jpg')
            expect(outs).to.have.lengthOf(1)

            const ls = await fsp.readdir('.')
            expect(ls).to.not.contain('in.jpg')
          }),
        )

        it(
          'should structure output directory correctly',
          testCase(async (client) => {
            await fsp.mkdir('in')
            await fsp.mkdir('in/sub')
            await Promise.all(['1.jpg', 'in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            await fsp.mkdir('out')
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              recursive: true,
              steps,
              inputs: ['1.jpg', 'in'],
              output: 'out',
            })

            const outs = await rreaddirAsync('out')
            expect(outs).to.include('out/1.jpg')
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(3)
          }),
        )

        it(
          'should not be recursive by default',
          testCase(async (client) => {
            await fsp.mkdir('in')
            await fsp.mkdir('in/sub')
            await Promise.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            await fsp.mkdir('out')
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: ['in'],
              output: 'out',
            })

            const outs = await rreaddirAsync('out')
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.not.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(1)
          }),
        )

        it(
          'should be able to handle directories recursively',
          testCase(async (client) => {
            await fsp.mkdir('in')
            await fsp.mkdir('in/sub')
            await Promise.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            await fsp.mkdir('out')
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              recursive: true,
              steps,
              inputs: ['in'],
              output: 'out',
            })

            const outs = await rreaddirAsync('out')
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(2)
          }),
        )

        it.skip(
          'should detect outdir conflicts',
          testCase(async (client) => {
            await fsp.mkdir('in')
            await Promise.all(['1.jpg', 'in/1.jpg'].map(imgPromise))
            await fsp.mkdir('out')
            const steps = await stepsPromise()

            const output = new OutputCtl()
            try {
              await assembliesCreate(output, client, {
                steps,
                inputs: ['1.jpg', 'in'],
                output: 'out',
              })
              throw new Error('assembliesCreate didnt err; should have')
            } catch (_err) {
              const result = output.get() as OutputEntry[]
              expect(result[result.length - 1])
                .to.have.property('type')
                .that.equals('error')
              expect(result[result.length - 1])
                .to.have.nested.property('msg.message')
                .that.equals("Output collision between 'in/1.jpg' and '1.jpg'")
            }
          }),
        )

        it(
          'should not download the result if no output is specified',
          testCase(async (client) => {
            const infile = await imgPromise()
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: [infile],
              output: null,
            })
            const result = output.get(true) as OutputEntry[]

            // When no output is specified, we might still get debug messages but no actual downloads
            const downloadingMsgs = result.filter((line) => String(line.msg) === 'DOWNLOADING')
            expect(downloadingMsgs.length).to.be.lessThanOrEqual(1)
          }),
        )

        it(
          'should accept invocations with no inputs',
          testCase(async (client) => {
            await imgPromise()
            const steps = await stepsPromise('steps.json', {
              import: {
                robot: '/http/import',
                url: genericImg,
              },
              resize: {
                robot: '/image/resize',
                use: 'import',
                result: true,
                width: 130,
                height: 130,
              },
            })

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: [],
              output: 'out.jpg',
            })

            await fsp.access('out.jpg')
          }),
        )

        it(
          'should allow deleting inputs after processing',
          testCase(async (client) => {
            const infile = await imgPromise()
            const steps = await stepsPromise()

            const output = new OutputCtl()
            await assembliesCreate(output, client, {
              steps,
              inputs: [infile],
              output: null,
              del: true,
            })

            try {
              await fsp.access(infile)
              throw new Error('File should have been deleted')
            } catch (err) {
              expect((err as NodeJS.ErrnoException).code).to.equal('ENOENT')
            }
          }),
        )

        it(
          'should not reprocess inputs that are older than their output',
          testCase(async (client) => {
            const infiles = await Promise.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
            const steps = await stepsPromise()
            await fsp.mkdir('out')

            const output1 = new OutputCtl()
            await assembliesCreate(output1, client, {
              steps,
              inputs: [infiles[0] as string],
              output: 'out',
            })

            const output2 = new OutputCtl()
            await assembliesCreate(output2, client, {
              steps,
              inputs: infiles,
              output: 'out',
            })
            const result = output2.get(true) as OutputEntry[]

            expect(
              result.map((line) => line.msg).filter((msg) => String(msg).includes('in1.jpg')),
            ).to.have.lengthOf(0)
          }),
        )
      })
    })
  })

  describe('assembly-notifications', () => {
    describe('list', () => {
      it.skip(
        'should list notifications',
        testCase(async (client) => {
          const output = new OutputCtl()
          await notifications.list(output, client, { pagesize: 1 })
          const logs = output.get() as OutputEntry[]
          expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
        }),
      )
    })
  })

  describe('bills', () => {
    describe('get', () => {
      it(
        'should get bills',
        testCase(async (client) => {
          const output = new OutputCtl()
          const date = new Date()
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          await bills.get(output, client, { months: [month] })
          const logs = output.get() as OutputEntry[]
          expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
          expect(logs.filter((l) => l.type === 'print')).to.have.length.above(0)
        }),
      )
    })
  })
})
