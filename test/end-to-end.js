import fs from 'node:fs'
import path from 'node:path'
import imgSize from 'image-size'
import Q from 'q'
import rreaddir from 'recursive-readdir'
import request from 'request'
import rimraf from 'rimraf'
import { Transloadit as TransloaditClient } from 'transloadit'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as assemblies from '../src/assemblies.js'
import assembliesCreate from '../src/assemblies-create.js'
import * as bills from '../src/bills.js'
import { zip } from '../src/helpers.js'
import * as notifications from '../src/notifications.js'
import * as templates from '../src/templates.js'
import OutputCtl from './OutputCtl.js'
import 'dotenv/config'
import process from 'node:process'

const tmpDir = '/tmp'

const authKey = process.env.TRANSLOADIT_KEY
const authSecret = process.env.TRANSLOADIT_SECRET

if (!authKey || !authSecret) {
  console.error(
    'Please provide environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET to run tests',
  )
  process.exit(1)
}

const _testno = 0

process.setMaxListeners(Number.POSITIVE_INFINITY)

function testCase(cb) {
  const cwd = process.cwd()
  return () => {
    const dirname = path.join(
      tmpDir,
      `transloadify_test-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    )
    const client = new TransloaditClient({ authKey, authSecret })
    return Q.nfcall(fs.mkdir, dirname)
      .then(() => {
        for (const evt of ['exit', 'SIGINT', 'uncaughtException']) {
          process.on(evt, () => {
            try {
              rimraf.sync(dirname)
            } catch (e) {
              if (e.code !== 'ENOENT') throw e
            }
            process.exit()
          })
        }
        process.chdir(dirname)
        return cb(client)
      })
      .fin(() => {
        process.chdir(cwd)
        return Q.nfcall(rimraf, dirname)
      })
  }
}

describe('End-to-end', () => {
  describe('templates', () => {
    describe('create', () => {
      it(
        'should create templates',
        testCase((client) => {
          const executions = [1, 2, 3, 4, 5].map((n) => {
            const output = new OutputCtl()
            // Make a file with the template contents
            return (
              Q.nfcall(fs.writeFile, `${n}.json`, JSON.stringify({ testno: n }))
                // run the test subject
                .then(() =>
                  templates.create(output, client, { name: `test-${n}`, file: `${n}.json` }),
                )
                // ignore the promise result, just look at the output the user would
                // see
                .then(() => output.get())
            )
          })

          return Q.all(executions).then((results) => {
            return Q.all(
              results.map((result) => {
                return Q.fcall(() => {
                  // Verify that the output looks as expected
                  expect(result).to.have.lengthOf(1)
                  expect(result).to.have.nested.property('[0].type').that.equals('print')
                  expect(result).to.have.nested.property('[0].msg').that.equals(result[0].json.id)
                }).fin(() => {
                  // delete these test templates from the server, but don't fail the
                  // test if it doesn't work
                  return client.deleteTemplate(result[0].json.id).catch(() => {})
                })
              }),
            )
          })
        }),
      )
    })

    describe('get', () => {
      it(
        'should get templates',
        testCase((client) => {
          // get some valid template IDs to request
          const templateRequests = client
            .listTemplates({ pagesize: 5 })
            .then((response) => response.items)
            .then((templates) => {
              if (templates.length === 0) throw new Error('account has no templates to fetch')
              return templates
            })

          const sdkResults = templateRequests.then((ts) => {
            return Q.all(
              ts.map((template) => {
                return client.getTemplate(template.id)
              }),
            )
          })

          const transloadifyResults = templateRequests.then((ts) => {
            return Q.all(
              ts.map((template) => {
                const output = new OutputCtl()
                return templates
                  .get(output, client, { templates: [template.id] })
                  .then(() => output.get())
              }),
            )
          })

          return Q.spread([sdkResults, transloadifyResults], (expectations, actuals) => {
            return Q.all(
              zip(expectations, actuals).map(([expectation, actual]) => {
                expect(actual).to.have.lengthOf(1)
                expect(actual).to.have.nested.property('[0].type').that.equals('print')
                expect(actual).to.have.nested.property('[0].json').that.deep.equals(expectation)
                return null
              }),
            )
          })
        }),
      )

      it(
        'should return templates in the order specified',
        testCase((client) => {
          const templateRequests = client
            .listTemplates({ pagesize: 5 })
            .then((response) => response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1))
            .then((templates) => {
              if (templates.length === 0) throw new Error('account has no templates to fetch')
              return templates
            })

          const idsPromise = templateRequests.then((templates) =>
            templates.map((template) => template.id),
          )

          const resultsPromise = idsPromise.then((ids) => {
            const output = new OutputCtl()
            return templates.get(output, client, { templates: ids }).then(() => output.get())
          })

          return Q.spread([resultsPromise, idsPromise], (results, ids) => {
            expect(results).to.have.lengthOf(ids.length)
            return Q.all(
              zip(results, ids).map(([result, id]) => {
                expect(result).to.have.property('type').that.equals('print')
                expect(result).to.have.nested.property('json.id').that.equals(id)
                return null
              }),
            )
          })
        }),
      )
    })

    describe('modify', () => {
      let templateId

      beforeAll(() => {
        const client = new TransloaditClient({ authKey, authSecret })
        return client
          .createTemplate({
            name: 'original-name',
            template: JSON.stringify({ stage: 0 }),
          })
          .then((response) => {
            templateId = response.id
          })
      })

      it(
        'should modify but not rename the template',
        testCase((client) => {
          const filePromise = Q.nfcall(fs.writeFile, 'template.json', JSON.stringify({ stage: 1 }))

          const resultPromise = filePromise.then(() => {
            const output = new OutputCtl()
            return templates
              .modify(output, client, {
                template: templateId,
                file: 'template.json',
              })
              .then(() => output.get())
          })

          return resultPromise.then((result) => {
            expect(result).to.have.lengthOf(0)
            return Q.delay(2000)
              .then(() => client.getTemplate(templateId))
              .then((template) => {
                expect(template).to.have.property('name').that.equals('original-name')
                expect(template).to.have.property('content').that.deep.equals({ stage: 1 })
              })
          })
        }),
      )

      it(
        'should not modify but rename the template',
        testCase((client) => {
          const filePromise = Q.nfcall(fs.writeFile, 'template.json', '')

          const resultPromise = filePromise.then(() => {
            const output = new OutputCtl()
            return templates
              .modify(output, client, {
                template: templateId,
                name: 'new-name',
                file: 'template.json',
              })
              .then(() => output.get())
          })

          return resultPromise.then((result) => {
            expect(result).to.have.lengthOf(0)
            return Q.delay(2000)
              .then(() => client.getTemplate(templateId))
              .then((template) => {
                expect(template).to.have.property('name').that.equals('new-name')
                expect(template).to.have.property('content').that.deep.equals({ stage: 1 })
              })
          })
        }),
      )

      it(
        'should modify and rename the template',
        testCase((client) => {
          const filePromise = Q.nfcall(fs.writeFile, 'template.json', JSON.stringify({ stage: 2 }))

          const resultPromise = filePromise.then(() => {
            const output = new OutputCtl()
            return templates
              .modify(output, client, {
                template: templateId,
                name: 'newer-name',
                file: 'template.json',
              })
              .then(() => output.get())
          })

          return resultPromise.then((result) => {
            expect(result).to.have.lengthOf(0)
            return Q.delay(2000)
              .then(() => client.getTemplate(templateId))
              .then((template) => {
                expect(template).to.have.property('name').that.equals('newer-name')
                expect(template).to.have.property('content').that.deep.equals({ stage: 2 })
              })
          })
        }),
      )

      afterAll(() => {
        const client = new TransloaditClient({ authKey, authSecret })
        return client.deleteTemplate(templateId)
      })
    })

    describe('delete', () => {
      it(
        'should delete templates',
        testCase((client) => {
          const templateIdsPromise = Q.all(
            [1, 2, 3, 4, 5].map((n) => {
              return client
                .createTemplate({
                  name: `delete-test-${n}`,
                  template: JSON.stringify({ n }),
                })
                .then((response) => response.id)
            }),
          )

          const resultPromise = templateIdsPromise.then((ids) => {
            const output = new OutputCtl()
            return templates.delete(output, client, { templates: ids }).then(() => output.get())
          })

          return Q.spread([resultPromise, templateIdsPromise], (result, ids) => {
            expect(result).to.have.lengthOf(0)
            return Q.all(
              ids.map((id) => {
                return client
                  .getTemplate(id)
                  .then((response) => {
                    expect(response).to.not.exist
                  })
                  .catch((err) => {
                    const errorCode =
                      err.code || err.transloaditErrorCode || err.response?.body?.error
                    if (errorCode !== 'TEMPLATE_NOT_FOUND') {
                      console.error('Delete failed with unexpected error:', err, 'Code:', errorCode)
                      throw err
                    }
                  })
              }),
            )
          })
        }),
      )
    })

    describe('sync', () => {
      it(
        'should handle directories recursively',
        testCase((client) => {
          const templateIdsPromise = client
            .listTemplates({
              pagesize: 5,
            })
            .then((response) => response.items.map((item) => ({ id: item.id, name: item.name })))

          const filesPromise = templateIdsPromise.then((ids) => {
            let dirname = 'd'
            let promise = Q.fcall(() => {})

            return Q.all(
              ids.map(({ id, name }) => {
                promise = promise.then(() => {
                  const fname = path.join(dirname, `${name}.json`)
                  return Q.nfcall(fs.mkdir, dirname)
                    .then(() =>
                      Q.nfcall(fs.writeFile, fname, `{"transloadit_template_id":"${id}"}`),
                    )
                    .then(() => {
                      dirname = path.join(dirname, 'd')
                    })
                    .then(() => fname)
                })
                return promise
              }),
            )
          })

          const resultPromise = filesPromise.then((_files) => {
            const output = new OutputCtl()
            return templates
              .sync(output, client, { recursive: true, files: ['d'] })
              .then(() => output.get())
          })

          return Q.spread(
            [resultPromise, templateIdsPromise, filesPromise],
            (result, ids, files) => {
              expect(result).to.have.lengthOf(0)
              const fileContentsPromise = Q.all(
                files.map((file) => Q.nfcall(fs.readFile, file).then(JSON.parse)),
              )
              return fileContentsPromise.then((contents) => {
                return Q.all(
                  zip(contents, ids).map(([content, id]) => {
                    expect(content).to.have.property('transloadit_template_id').that.equals(id.id)
                    expect(content).to.have.property('steps')
                    return null
                  }),
                )
              })
            },
          )
        }),
      )

      it(
        'should update local files when outdated',
        testCase((client) => {
          const params = {
            name: 'test-local-update-1',
            template: JSON.stringify({ changed: true }),
          }
          const templateIdPromise = client.createTemplate(params).then((response) => response.id)

          const filePromise = templateIdPromise.then((id) => {
            const fname = `${params.name}.json`
            return Q.nfcall(
              fs.writeFile,
              fname,
              JSON.stringify({
                transloadit_template_id: id,
                steps: { changed: false },
              }),
            )
              .then(() => Q.nfcall(fs.utimes, fname, 0, 0)) // make the file appear old
              .then(() => fname)
          })

          const resultPromise = filePromise.then((fname) => {
            const output = new OutputCtl()
            return templates.sync(output, client, { files: [fname] }).then(() => output.get())
          })

          return Q.spread([resultPromise, templateIdPromise, filePromise], (result, id, fname) => {
            expect(result).to.have.lengthOf(0)
            return Q.nfcall(fs.readFile, fname)
              .then(JSON.parse)
              .then((content) => {
                expect(content).to.have.property('steps').that.has.property('changed').that.is.true
              })
              .then(() => client.getTemplate(id))
              .then((response) => {
                expect(response).to.have.property('content').that.has.property('changed').that.is
                  .true
              })
          }).fin(() => {
            return templateIdPromise.then((id) => client.deleteTemplate(id)).catch(() => {})
          })
        }),
      )

      it(
        'should update remote template when outdated',
        testCase((client) => {
          const params = {
            name: 'test-local-update-1',
            template: JSON.stringify({ changed: false }),
          }
          const templateIdPromise = client.createTemplate(params).then((response) => response.id)

          const filePromise = templateIdPromise.then((id) => {
            const fname = `${params.name}.json`
            return Q.nfcall(
              fs.writeFile,
              fname,
              JSON.stringify({
                transloadit_template_id: id,
                steps: { changed: true },
              }),
            )
              .then(() => Q.nfcall(fs.utimes, fname, Date.now() * 2, Date.now() * 2)) // make the file appear new
              .then(() => fname)
          })

          const resultPromise = filePromise.then((fname) => {
            const output = new OutputCtl()
            return templates.sync(output, client, { files: [fname] }).then(() => output.get())
          })

          return Q.spread([resultPromise, templateIdPromise, filePromise], (result, id, fname) => {
            expect(result).to.have.lengthOf(0)
            return Q.nfcall(fs.readFile, fname)
              .then(JSON.parse)
              .then((content) => {
                expect(content).to.have.property('steps').that.has.property('changed').that.is.true
              })
              .then(() => client.getTemplate(id))
              .then((response) => {
                expect(response).to.have.property('content').that.has.property('changed').that.is
                  .true
              })
          }).fin(() => {
            return templateIdPromise.then((id) => client.deleteTemplate(id)).catch(() => {})
          })
        }),
      )
    })
  })

  describe('assemblies', () => {
    describe('get', () => {
      it(
        'should get assemblies',
        testCase((client) => {
          // get some valid assembly IDs to request
          const assemblyRequests = client
            .listAssemblies({
              pagesize: 5,
              type: 'completed',
            })
            .then((response) => response.items)
            .then((assemblies) => {
              if (assemblies.length === 0) throw new Error('account has no assemblies to fetch')
              return assemblies
            })

          const sdkResults = assemblyRequests.then((as) => {
            return Q.all(
              as.map((assembly) => {
                return client.getAssembly(assembly.id)
              }),
            )
          })

          const transloadifyResults = assemblyRequests.then((as) => {
            return Q.all(
              as.map((assembly) => {
                const output = new OutputCtl()
                return assemblies
                  .get(output, client, { assemblies: [assembly.id] })
                  .then(() => output.get())
              }),
            )
          })

          return Q.spread([sdkResults, transloadifyResults], (expectations, actuals) => {
            return Q.all(
              zip(expectations, actuals).map(([expectation, actual]) => {
                expect(actual).to.have.lengthOf(1)
                expect(actual).to.have.nested.property('[0].type').that.equals('print')
                expect(actual).to.have.nested.property('[0].json').that.deep.equals(expectation)
                return null
              }),
            )
          })
        }),
      )

      it(
        'should return assemblies in the order specified',
        testCase((client) => {
          const assemblyRequests = client
            .listAssemblies({ pagesize: 5 })
            .then((response) => response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1))
            .then((assemblies) => {
              if (assemblies.length === 0) throw new Error('account has no assemblies to fetch')
              return assemblies
            })

          const idsPromise = assemblyRequests.then((assemblies) =>
            assemblies.map((assembly) => assembly.id),
          )

          const resultsPromise = idsPromise.then((ids) => {
            const output = new OutputCtl()
            return assemblies.get(output, client, { assemblies: ids }).then(() => output.get())
          })

          return Q.spread([resultsPromise, idsPromise], (results, ids) => {
            try {
              expect(results).to.have.lengthOf(ids.length)
            } catch (e) {
              console.error('DEBUG: Results:', JSON.stringify(results, null, 2))
              console.error('DEBUG: Ids:', JSON.stringify(ids, null, 2))
              throw e
            }
            return Q.all(
              zip(results, ids).map(([result, id]) => {
                expect(result).to.have.property('type').that.equals('print')
                expect(result).to.have.nested.property('json.assembly_id').that.equals(id)
                return null
              }),
            )
          })
        }),
      )
      describe('list', () => {
        it(
          'should list assemblies',
          testCase((client) => {
            const output = new OutputCtl()
            return assemblies.list(output, client, { pagesize: 1 }).then(() => {
              const logs = output.get()
              // Should have at least some output if there are assemblies, or none if empty.
              // We can't guarantee assemblies exist, but we can check if it ran without error.
              // Actually, previous tests likely created assemblies.
              // Let's just assert no error.
              expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
            })
          }),
        )
      })

      describe('delete', () => {
        it(
          'should delete assemblies',
          testCase((client) => {
            // Create an assembly to delete
            const createPromise = client.createAssembly({
              params: {
                steps: { import: { robot: '/http/import', url: 'https://placehold.co/100.jpg' } },
              },
            })

            return createPromise.then((assembly) => {
              const output = new OutputCtl()
              return assemblies
                .delete(output, client, { assemblies: [assembly.assembly_id] })
                .then(() => {
                  return client.getAssembly(assembly.assembly_id)
                })
                .then((res) => {
                  // Should be deleted, but getAssembly might return it with different status or 404?
                  // SDK cancelAssembly returns AssemblyStatus.
                  // getAssembly on deleted assembly usually works for a while but status might change?
                  // Or 404?
                  // Actually cancelAssembly aborts it.
                  expect(res.ok).to.equal('ASSEMBLY_CANCELED')
                })
            })
          }),
        )
      })

      describe('replay', () => {
        it(
          'should replay assemblies',
          testCase((client) => {
            // Create an assembly to replay
            const createPromise = client.createAssembly({
              params: {
                steps: { import: { robot: '/http/import', url: 'https://placehold.co/100.jpg' } },
              },
            })

            return createPromise.then((assembly) => {
              const output = new OutputCtl()
              return assemblies
                .replay(output, client, { assemblies: [assembly.assembly_id], steps: null })
                .then(() => {
                  const logs = output.get()
                  expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
                })
            })
          }),
        )
      })

      describe('create', () => {
        const genericImg = 'https://placehold.co/100.jpg'
        function imgPromise(fname = 'in.jpg') {
          return Q.Promise((resolve, reject) => {
            const req = request(genericImg)
            req.pipe(fs.createWriteStream(fname))
            req.on('error', reject)
            req.on('end', () => resolve(fname))
          })
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
        function stepsPromise(_fname = 'steps.json', steps = genericSteps) {
          return Q.nfcall(fs.writeFile, 'steps.json', JSON.stringify(steps)).then(
            () => 'steps.json',
          )
        }

        it(
          'should transcode a file',
          testCase((client) => {
            const inFilePromise = imgPromise()
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
              const output = new OutputCtl()
              return assembliesCreate(output, client, {
                steps,
                inputs: [infile],
                output: 'out.jpg',
              }).then(() => output.get(true))
            })

            return resultPromise.then((result) => {
              expect(result).to.have.lengthOf(3)
              expect(result).to.have.nested.property('[0].type').that.equals('debug')
              expect(result)
                .to.have.nested.property('[0].msg')
                .that.equals('GOT JOB in.jpg out.jpg')
              expect(result).to.have.nested.property('[1].type').that.equals('debug')
              expect(result).to.have.nested.property('[1].msg').that.equals('DOWNLOADING')
              expect(result).to.have.nested.property('[2].type').that.equals('debug')
              expect(result)
                .to.have.nested.property('[2].msg')
                .that.equals('COMPLETED in.jpg out.jpg')
              return Q.nfcall(imgSize, 'out.jpg').then((dim) => {
                expect(dim).to.have.property('width').that.equals(130)
                expect(dim).to.have.property('height').that.equals(130)
              })
            })
          }),
        )

        it(
          'should handle multiple inputs',
          testCase((client) => {
            const inFilesPromise = Q.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
            const stepsFilePromise = stepsPromise()
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')

            const resultPromise = Q.spread(
              [inFilesPromise, stepsFilePromise, outdirPromise],
              (infiles, steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  steps,
                  inputs: infiles,
                  output: 'out',
                }).then(() => output.get())
              },
            )

            return resultPromise.then((_result) => {
              return Q.nfcall(fs.readdir, 'out').then((outs) => {
                expect(outs).to.have.property(0).that.equals('in1.jpg')
                expect(outs).to.have.property(1).that.equals('in2.jpg')
                expect(outs).to.have.property(2).that.equals('in3.jpg')
                expect(outs).to.have.lengthOf(3)
              })
            })
          }),
        )

        it(
          'should not output outside outdir',
          testCase((client) => {
            return Q.nfcall(fs.mkdir, 'sub').then(() => {
              process.chdir('sub')
              const inFilePromise = imgPromise('../in.jpg')
              const outdirPromise = Q.nfcall(fs.mkdir, 'out')
              const stepsFilePromise = stepsPromise()

              const resultPromise = Q.spread(
                [inFilePromise, stepsFilePromise, outdirPromise],
                (infile, steps) => {
                  const output = new OutputCtl()
                  return assembliesCreate(output, client, {
                    steps,
                    inputs: [infile],
                    output: 'out',
                  }).then(() => output.get())
                },
              )

              return resultPromise.then((_result) => {
                const outcheck = Q.nfcall(fs.readdir, 'out').then((outs) => {
                  expect(outs).to.have.property(0).that.equals('in.jpg')
                  expect(outs).to.have.lengthOf(1)
                })

                const pwdcheck = Q.nfcall(fs.readdir, '.').then((ls) => {
                  expect(ls).to.not.contain('in.jpg')
                })

                return Q.all([outcheck, pwdcheck])
              })
            })
          }),
        )

        it(
          'should structure output directory correctly',
          testCase((client) => {
            const indirPromise = Q.nfcall(fs.mkdir, 'in').then(() => Q.nfcall(fs.mkdir, 'in/sub'))
            const inFilesPromise = indirPromise.then(() => {
              return Q.all(['1.jpg', 'in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            })
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread(
              [stepsFilePromise, inFilesPromise, outdirPromise],
              (steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  recursive: true,
                  steps,
                  inputs: ['1.jpg', 'in'],
                  output: 'out',
                }).then(() => output.get())
              },
            )

            return resultPromise.then((_result) => {
              return Q.nfcall(rreaddir, 'out').then((outs) => {
                expect(outs).to.include('out/1.jpg')
                expect(outs).to.include('out/2.jpg')
                expect(outs).to.include('out/sub/3.jpg')
                expect(outs).to.have.lengthOf(3)
              })
            })
          }),
        )

        it(
          'should not be recursive by default',
          testCase((client) => {
            const indirPromise = Q.nfcall(fs.mkdir, 'in').then(() => Q.nfcall(fs.mkdir, 'in/sub'))
            const inFilesPromise = indirPromise.then(() => {
              return Q.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            })
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread(
              [stepsFilePromise, inFilesPromise, outdirPromise],
              (steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  steps,
                  inputs: ['in'],
                  output: 'out',
                }).then(() => output.get())
              },
            )

            return resultPromise.then((_result) => {
              return Q.nfcall(rreaddir, 'out').then((outs) => {
                expect(outs).to.include('out/2.jpg')
                expect(outs).to.not.include('out/sub/3.jpg')
                expect(outs).to.have.lengthOf(1)
              })
            })
          }),
        )

        it(
          'should be able to handle directories recursively',
          testCase((client) => {
            const indirPromise = Q.nfcall(fs.mkdir, 'in').then(() => Q.nfcall(fs.mkdir, 'in/sub'))
            const inFilesPromise = indirPromise.then(() => {
              return Q.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
            })
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread(
              [stepsFilePromise, inFilesPromise, outdirPromise],
              (steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  recursive: true,
                  steps,
                  inputs: ['in'],
                  output: 'out',
                }).then(() => output.get())
              },
            )

            return resultPromise.then((_result) => {
              return Q.nfcall(rreaddir, 'out').then((outs) => {
                expect(outs).to.include('out/2.jpg')
                expect(outs).to.include('out/sub/3.jpg')
                expect(outs).to.have.lengthOf(2)
              })
            })
          }),
        )

        it.skip(
          'should detect outdir conflicts',
          testCase((client) => {
            const indirPromise = Q.nfcall(fs.mkdir, 'in')
            const inFilesPromise = indirPromise.then(() => {
              return Q.all(['1.jpg', 'in/1.jpg'].map(imgPromise))
            })
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')
            const stepsFilePromise = stepsPromise()

            const errMsgDeferred = Q.defer()

            Q.spread([stepsFilePromise, inFilesPromise, outdirPromise], (steps) => {
              const output = new OutputCtl()
              return assembliesCreate(output, client, {
                steps,
                inputs: ['1.jpg', 'in'],
                output: 'out',
              })
                .then(() =>
                  errMsgDeferred.reject(new Error('assembliesCreate didnt err; should have')),
                )
                .catch((err) => {
                  errMsgDeferred.resolve(output.get(), err) // pass err to satisfy linter
                })
            })

            return errMsgDeferred.promise.then((result) => {
              expect(result[result.length - 1])
                .to.have.property('type')
                .that.equals('error')
              expect(result[result.length - 1])
                .to.have.nested.property('msg.message')
                .that.equals("Output collision between 'in/1.jpg' and '1.jpg'")
            })
          }),
        )

        it(
          'should not download the result if no output is specified',
          testCase((client) => {
            const inFilePromise = imgPromise()
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
              const output = new OutputCtl()
              return assembliesCreate(output, client, {
                steps,
                inputs: [infile],
                output: null,
              }).then(() => output.get(true))
            })

            return resultPromise.then((result) => {
              expect(result.filter((line) => line.msg === 'DOWNLOADING')).to.have.lengthOf(0)
            })
          }),
        )

        it(
          'should accept invocations with no inputs',
          testCase((client) => {
            const inFilePromise = imgPromise()
            const stepsFilePromise = stepsPromise('steps.json', {
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

            const resultPromise = Q.spread([inFilePromise, stepsFilePromise], (_infile, steps) => {
              const output = new OutputCtl()
              return assembliesCreate(output, client, {
                steps,
                inputs: [],
                output: 'out.jpg',
              }).then(() => output.get(true))
            })

            return resultPromise.then((_result) => Q.nfcall(fs.access, 'out.jpg'))
          }),
        )

        it(
          'should allow deleting inputs after processing',
          testCase((client) => {
            const inFilePromise = imgPromise()
            const stepsFilePromise = stepsPromise()

            const resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
              const output = new OutputCtl()
              return assembliesCreate(output, client, {
                steps,
                inputs: [infile],
                output: null,
                del: true,
              }).then(() => output.get(true))
            })

            return Q.spread([inFilePromise, resultPromise], (infile) => {
              return Q.Promise((resolve, reject) => {
                fs.access(infile, (err) => {
                  try {
                    expect(err).to.exist
                    resolve()
                  } catch (err) {
                    reject(err)
                  }
                })
              })
            })
          }),
        )

        it(
          'should not reprocess inputs that are older than their output',
          testCase((client) => {
            const inFilesPromise = Q.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
            const stepsFilePromise = stepsPromise()
            const outdirPromise = Q.nfcall(fs.mkdir, 'out')

            let resultPromise = Q.spread(
              [inFilesPromise, stepsFilePromise, outdirPromise],
              (infiles, steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  steps,
                  inputs: [infiles[0]],
                  output: 'out',
                })
              },
            )

            resultPromise = Q.spread(
              [inFilesPromise, stepsFilePromise, resultPromise],
              (infiles, steps) => {
                const output = new OutputCtl()
                return assembliesCreate(output, client, {
                  steps,
                  inputs: infiles,
                  output: 'out',
                }).then(() => output.get(true))
              },
            )

            return resultPromise.then((result) => {
              // assert that no log lines mention the stale input
              expect(
                result.map((line) => line.msg).filter((msg) => msg.includes('in1.jpg')),
              ).to.have.lengthOf(0)
            })
          }),
        )
      })
    })
  })

  describe('assembly-notifications', () => {
    describe('list', () => {
      it.skip(
        'should list notifications',
        testCase((client) => {
          const output = new OutputCtl()
          return notifications.list(output, client, { pagesize: 1 }).then(() => {
            const logs = output.get()
            expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
          })
        }),
      )
    })
  })

  describe('bills', () => {
    describe('get', () => {
      it(
        'should get bills',
        testCase((client) => {
          const output = new OutputCtl()
          const date = new Date()
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
          return bills.get(output, client, { months: [month] }).then(() => {
            const logs = output.get()
            expect(logs.filter((l) => l.type === 'error')).to.have.lengthOf(0)
            expect(logs.filter((l) => l.type === 'print')).to.have.length.above(0)
          })
        }),
      )
    })
  })
})
