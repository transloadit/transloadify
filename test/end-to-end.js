import OutputCtl from './OutputCtl'
import TransloaditClient from 'transloadit'
import fs from 'fs'
import path from 'path'
import Q from 'q'
import rimraf from 'rimraf'
import { expect } from 'chai'
import { zip } from '../src/helpers'
import imgSize from 'image-size'
import request from 'request'
import rreaddir from 'recursive-readdir'
const templates = require('../src/templates')
const assemblies = require('../src/assemblies')
import assembliesCreate from '../src/assemblies-create'

const tmpDir = '/tmp'

const authKey = process.env.TRANSLOADIT_KEY
const authSecret = process.env.TRANSLOADIT_SECRET

if (!authKey || !authSecret) {
  console.error('Please provide environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET to run tests')
  process.exit()
}

let testno = 0

process.setMaxListeners(Infinity)

function testCase (cb) {
  let cwd = process.cwd()
  return () => {
    let dirname = path.join(tmpDir, `transloadify_test_${testno++}`)
    let client = new TransloaditClient({ authKey, authSecret })
    return Q.nfcall(fs.mkdir, dirname)
      .then(() => {
        for (let evt of ['exit', 'SIGINT', 'uncaughtException']) {
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
      }).fin(() => {
        process.chdir(cwd)
        return Q.nfcall(rimraf, dirname)
      })
  }
}

describe('End-to-end', function () {
  this.timeout(100000)

  describe('templates', function () {
    describe('create', function () {
      it('should create templates', testCase(client => {
        let executions = [1, 2, 3, 4, 5].map(n => {
          let output = new OutputCtl()
          // Make a file with the template contents
          return Q.nfcall(fs.writeFile, `${n}.json`, JSON.stringify({ testno: n }))
            // run the test subject
            .then(() => templates.create(output, client, { name: `test_${n}`, file: `${n}.json` }))
            // ignore the promise result, just look at the output the user would
            // see
            .then(() => output.get())
        })

        return Q.all(executions).then(results => {
          return Q.all(results.map(result => {
            return Q.fcall(() => {
              // Verify that the output looks as expected
              expect(result).to.have.lengthOf(1)
              expect(result).to.have.deep.property('[0].type').that.equals('print')
              expect(result).to.have.deep.property('[0].msg').that.equals(result[0].json.id)
            }).fin(() => {
              // delete these test templates from the server, but don't fail the
              // test if it doesn't work
              return Q.nfcall(client.deleteTemplate.bind(client), result[0].json.id)
                .fail(() => {})
            })
          }))
        })
      }))
    })

    describe('get', function () {
      it('should get templates', testCase(client => {
        // get some valid template IDs to request
        let templateRequests = Q.nfcall(client.listTemplates.bind(client), { pagesize: 5 })
          .then(response => response.items)
          .then(templates => {
            if (templates.length === 0) throw new Error('account has no templates to fetch')
            return templates
          })

        let sdkResults = templateRequests.then(ts => {
          return Q.all(ts.map(template => {
            return Q.nfcall(client.getTemplate.bind(client), template.id)
          }))
        })

        let transloadifyResults = templateRequests.then(ts => {
          return Q.all(ts.map(template => {
            let output = new OutputCtl()
            return templates.get(output, client, { templates: [template.id] })
              .then(() => output.get())
          }))
        })

        return Q.spread([sdkResults, transloadifyResults], (expectations, actuals) => {
          return Q.all(zip(expectations, actuals).map(([expectation, actual]) => {
            expect(actual).to.have.lengthOf(1)
            expect(actual).to.have.deep.property('[0].type').that.equals('print')
            expect(actual).to.have.deep.property('[0].json').that.deep.equals(expectation)
          }))
        })
      }))

      it('should return templates in the order specified', testCase(client => {
        let templateRequests = Q.nfcall(client.listTemplates.bind(client), { pagesize: 5 })
          .then(response => response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1))
          .then(templates => {
            if (templates.length === 0) throw new Error('account has no templates to fetch')
            return templates
          })

        let idsPromise = templateRequests
          .then(templates => templates.map(template => template.id))

        let resultsPromise = idsPromise.then(ids => {
          let output = new OutputCtl()
          return templates.get(output, client, { templates: ids })
            .then(() => output.get())
        })

        return Q.spread([resultsPromise, idsPromise], (results, ids) => {
          expect(results).to.have.lengthOf(ids.length)
          return Q.all(zip(results, ids).map(([result, id]) => {
            expect(result).to.have.property('type').that.equals('print')
            expect(result).to.have.deep.property('json.id').that.equals(id)
          }))
        })
      }))
    })

    describe('modify', function () {
      let templateId

      before(function () {
        let client = new TransloaditClient({ authKey, authSecret })
        return Q.nfcall(client.createTemplate.bind(client), {
          name: 'originalName',
          template: JSON.stringify({ stage: 0 })
        }).then(response => { templateId = response.id })
      })

      it('should modify but not rename the template', testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, 'template.json', JSON.stringify({ stage: 1 }))

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId,
            file: 'template.json'
          }).then(() => output.get())
        })

        return resultPromise.then(result => {
          expect(result).to.have.lengthOf(0)
          return Q.delay(2000).then(() => Q.nfcall(client.getTemplate.bind(client), templateId))
            .then(template => {
              expect(template).to.have.property('name').that.equals('originalName')
              expect(template).to.have.property('content').that.deep.equals({ stage: 1 })
            })
        })
      }))

      it('should not modify but rename the template', testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, 'template.json', '')

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId,
            name: 'newName',
            file: 'template.json'
          }).then(() => output.get())
        })

        return resultPromise.then(result => {
          expect(result).to.have.lengthOf(0)
          return Q.delay(2000).then(() => Q.nfcall(client.getTemplate.bind(client), templateId))
            .then(template => {
              expect(template).to.have.property('name').that.equals('newName')
              expect(template).to.have.property('content').that.deep.equals({ stage: 1 })
            })
        })
      }))

      it('should modify and rename the template', testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, 'template.json', JSON.stringify({ stage: 2 }))

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId,
            name: 'newerName',
            file: 'template.json'
          }).then(() => output.get())
        })

        return resultPromise.then(result => {
          expect(result).to.have.lengthOf(0)
          return Q.delay(2000).then(() => Q.nfcall(client.getTemplate.bind(client), templateId))
            .then(template => {
              expect(template).to.have.property('name').that.equals('newerName')
              expect(template).to.have.property('content').that.deep.equals({ stage: 2 })
            })
        })
      }))

      after(function () {
        let client = new TransloaditClient({ authKey, authSecret })
        return Q.nfcall(client.deleteTemplate.bind(client), templateId)
      })
    })

    describe('delete', function () {
      it('should delete templates', testCase(client => {
        let templateIdsPromise = Q.all([1, 2, 3, 4, 5].map(n => {
          return Q.nfcall(client.createTemplate.bind(client), {
            name: `delete_test_${n}`,
            template: JSON.stringify({ n })
          }).then(response => response.id)
        }))

        let resultPromise = templateIdsPromise.then(ids => {
          let output = new OutputCtl()
          return templates.delete(output, client, { templates: ids })
            .then(() => output.get())
        })

        return Q.spread([resultPromise, templateIdsPromise], (result, ids) => {
          expect(result).to.have.lengthOf(0)
          return Q.all(ids.map(id => {
            return Q.nfcall(client.getTemplate.bind(client), id)
              .then(response => { expect(response).to.not.exist })
              .fail(err => {
                if (err.error !== 'TEMPLATE_NOT_FOUND') throw err
              })
          }))
        })
      }))
    })

    describe('sync', function () {
      it('should handle directories recursively', testCase(client => {
        let templateIdsPromise = Q.nfcall(client.listTemplates.bind(client), { pagesize: 5 })
          .then(response => response.items.map(item => ({ id: item.id, name: item.name })))

        let filesPromise = templateIdsPromise.then(ids => {
          let dirname = 'd'
          let promise = Q.fcall(() => {})

          return Q.all(ids.map(({id, name}) => {
            return (promise = promise.then(() => {
              let fname = path.join(dirname, `${name}.json`)
              return Q.nfcall(fs.mkdir, dirname)
                .then(() => Q.nfcall(fs.writeFile, fname, `{"transloadit_template_id":"${id}"}`))
                .then(() => { dirname = path.join(dirname, 'd') })
                .then(() => fname)
            }))
          }))
        })

        let resultPromise = filesPromise.then(files => {
          let output = new OutputCtl()
          return templates.sync(output, client, { recursive: true, files: ['d'] })
            .then(() => output.get())
        })

        return Q.spread([resultPromise, templateIdsPromise, filesPromise], (result, ids, files) => {
          expect(result).to.have.lengthOf(0)
          let fileContentsPromise = Q.all(files.map(file => Q.nfcall(fs.readFile, file).then(JSON.parse)))
          return fileContentsPromise.then(contents => {
            return Q.all(zip(contents, ids).map(([content, id]) => {
              expect(content).to.have.property('transloadit_template_id').that.equals(id.id)
              expect(content).to.have.property('steps')
            }))
          })
        })
      }))

      it('should update local files when outdated', testCase(client => {
        let params = {
          name: 'test_local_update',
          template: JSON.stringify({ changed: true })
        }
        let templateIdPromise = Q.nfcall(client.createTemplate.bind(client), params)
          .then(response => response.id)

        let filePromise = templateIdPromise.then(id => {
          let fname = `${params.name}.json`
          return Q.nfcall(fs.writeFile,
                          fname,
                          JSON.stringify({
                            transloadit_template_id: id,
                            steps: { changed: false }
                          }))
            .then(() => Q.nfcall(fs.utimes, fname, 0, 0)) // make the file appear old
            .then(() => fname)
        })

        let resultPromise = filePromise.then(fname => {
          let output = new OutputCtl()
          return templates.sync(output, client, { files: [fname] })
            .then(() => output.get())
        })

        return Q.spread([resultPromise, templateIdPromise, filePromise], (result, id, fname) => {
          expect(result).to.have.lengthOf(0)
          return Q.nfcall(fs.readFile, fname).then(JSON.parse)
            .then(content => {
              expect(content).to.have.property('steps').that.has.property('changed').that.is.true
            })
            .then(() => Q.nfcall(client.getTemplate.bind(client), id))
            .then(response => {
              expect(response).to.have.property('content').that.has.property('changed').that.is.true
            })
        }).fin(() => {
          return templateIdPromise.then(id => Q.nfcall(client.deleteTemplate.bind(client), id))
            .fail(() => {})
        })
      }))

      it('should update remote template when outdated', testCase(client => {
        let params = {
          name: 'test_local_update',
          template: JSON.stringify({ changed: false })
        }
        let templateIdPromise = Q.nfcall(client.createTemplate.bind(client), params)
          .then(response => response.id)

        let filePromise = templateIdPromise.then(id => {
          let fname = `${params.name}.json`
          return Q.nfcall(fs.writeFile,
                          fname,
                          JSON.stringify({
                            transloadit_template_id: id,
                            steps: { changed: true }
                          }))
            .then(() => Q.nfcall(fs.utimes, fname, Date.now() * 2, Date.now() * 2)) // make the file appear new
            .then(() => fname)
        })

        let resultPromise = filePromise.then(fname => {
          let output = new OutputCtl()
          return templates.sync(output, client, { files: [fname] })
            .then(() => output.get())
        })

        return Q.spread([resultPromise, templateIdPromise, filePromise], (result, id, fname) => {
          expect(result).to.have.lengthOf(0)
          return Q.nfcall(fs.readFile, fname).then(JSON.parse)
            .then(content => {
              expect(content).to.have.property('steps').that.has.property('changed').that.is.true
            })
            .then(() => Q.nfcall(client.getTemplate.bind(client), id))
            .then(response => {
              expect(response).to.have.property('content').that.has.property('changed').that.is.true
            })
        }).fin(() => {
          return templateIdPromise.then(id => Q.nfcall(client.deleteTemplate.bind(client), id))
            .fail(() => {})
        })
      }))
    })
  })

  describe('assemblies', function () {
    describe('get', function () {
      it('should get assemblies', testCase(client => {
        // get some valid assembly IDs to request
        let assemblyRequests = Q.nfcall(client.listAssemblies.bind(client), { pagesize: 5 })
          .then(response => response.items)
          .then(assemblies => {
            if (assemblies.length === 0) throw new Error('account has no assemblies to fetch')
            return assemblies
          })

        let sdkResults = assemblyRequests.then(as => {
          return Q.all(as.map(assembly => {
            return Q.nfcall(client.getAssembly.bind(client), assembly.id)
          }))
        })

        let transloadifyResults = assemblyRequests.then(as => {
          return Q.all(as.map(assembly => {
            let output = new OutputCtl()
            return assemblies.get(output, client, { assemblies: [assembly.id] })
              .then(() => output.get())
          }))
        })

        return Q.spread([sdkResults, transloadifyResults], (expectations, actuals) => {
          return Q.all(zip(expectations, actuals).map(([expectation, actual]) => {
            expect(actual).to.have.lengthOf(1)
            expect(actual).to.have.deep.property('[0].type').that.equals('print')
            expect(actual).to.have.deep.property('[0].json').that.deep.equals(expectation)
          }))
        })
      }))

      it('should return assemblies in the order specified', testCase(client => {
        let assemblyRequests = Q.nfcall(client.listAssemblies.bind(client), { pagesize: 5 })
          .then(response => response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1))
          .then(assemblies => {
            if (assemblies.length === 0) throw new Error('account has no assemblies to fetch')
            return assemblies
          })

        let idsPromise = assemblyRequests
          .then(assemblies => assemblies.map(assembly => assembly.id))

        let resultsPromise = idsPromise.then(ids => {
          let output = new OutputCtl()
          return assemblies.get(output, client, { assemblies: ids })
            .then(() => output.get())
        })

        return Q.spread([resultsPromise, idsPromise], (results, ids) => {
          expect(results).to.have.lengthOf(ids.length)
          return Q.all(zip(results, ids).map(([result, id]) => {
            expect(result).to.have.property('type').that.equals('print')
            expect(result).to.have.deep.property('json.assembly_id').that.equals(id)
          }))
        })
      }))
    })

    describe('create', function () {
      const genericImg = 'https://transloadit.com/img/robots/170x170/audio-encode.jpg'
      function imgPromise (fname = 'in.jpg') {
        return Q.Promise((resolve, reject) => {
          let req = request(genericImg)
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
          height: 130
        }
      }
      function stepsPromise (fname = 'steps.json', steps = genericSteps) {
        return Q.nfcall(fs.writeFile, 'steps.json', JSON.stringify(steps))
          .then(() => 'steps.json')
      }

      it('should transcode a file', testCase(client => {
        let inFilePromise = imgPromise()
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: [infile], output: 'out.jpg' })
            .then(() => output.get(true))
        })

        return resultPromise.then(result => {
          expect(result).to.have.lengthOf(3)
          expect(result).to.have.deep.property('[0].type').that.equals('debug')
          expect(result).to.have.deep.property('[0].msg').that.equals('GOT JOB in.jpg out.jpg')
          expect(result).to.have.deep.property('[1].type').that.equals('debug')
          expect(result).to.have.deep.property('[1].msg').that.equals('DOWNLOADING')
          expect(result).to.have.deep.property('[2].type').that.equals('debug')
          expect(result).to.have.deep.property('[2].msg').that.equals('COMPLETED in.jpg out.jpg')
          return Q.nfcall(imgSize, 'out.jpg').then(dim => {
            expect(dim).to.have.property('width').that.equals(130)
            expect(dim).to.have.property('height').that.equals(130)
          })
        })
      }))

      it('should handle multiple inputs', testCase(client => {
        let inFilesPromise = Q.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
        let stepsFilePromise = stepsPromise()
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')

        let resultPromise = Q.spread([inFilesPromise, stepsFilePromise, outdirPromise], (infiles, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: infiles, output: 'out' })
            .then(() => output.get())
        })

        return resultPromise.then(result => {
          return Q.nfcall(fs.readdir, 'out').then(outs => {
            expect(outs).to.have.property(0).that.equals('in1.jpg')
            expect(outs).to.have.property(1).that.equals('in2.jpg')
            expect(outs).to.have.property(2).that.equals('in3.jpg')
            expect(outs).to.have.lengthOf(3)
          })
        })
      }))

      it('should not output outside outdir', testCase(client => {
        return Q.nfcall(fs.mkdir, 'sub').then(() => {
          process.chdir('sub')
          let inFilePromise = imgPromise('../in.jpg')
          let outdirPromise = Q.nfcall(fs.mkdir, 'out')
          let stepsFilePromise = stepsPromise()

          let resultPromise = Q.spread([inFilePromise, stepsFilePromise, outdirPromise], (infile, steps) => {
            let output = new OutputCtl()
            return assembliesCreate(output, client, { steps, inputs: [infile], output: 'out' })
              .then(() => output.get())
          })

          return resultPromise.then(result => {
            let outcheck = Q.nfcall(fs.readdir, 'out').then(outs => {
              expect(outs).to.have.property(0).that.equals('in.jpg')
              expect(outs).to.have.lengthOf(1)
            })

            let pwdcheck = Q.nfcall(fs.readdir, '.').then(ls => {
              expect(ls).to.not.contain('in.jpg')
            })

            return Q.all([outcheck, pwdcheck])
          })
        })
      }))

      it('should structure output directory correctly', testCase(client => {
        let indirPromise = Q.nfcall(fs.mkdir, 'in')
          .then(() => Q.nfcall(fs.mkdir, 'in/sub'))
        let inFilesPromise = indirPromise.then(() => {
          return Q.all(['1.jpg', 'in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
        })
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([stepsFilePromise, inFilesPromise, outdirPromise], (steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { recursive: true, steps, inputs: ['1.jpg', 'in'], output: 'out' })
            .then(() => output.get())
        })

        return resultPromise.then(result => {
          return Q.nfcall(rreaddir, 'out').then(outs => {
            expect(outs).to.include('out/1.jpg')
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(3)
          })
        })
      }))

      it('should not be recursive by default', testCase(client => {
        let indirPromise = Q.nfcall(fs.mkdir, 'in')
          .then(() => Q.nfcall(fs.mkdir, 'in/sub'))
        let inFilesPromise = indirPromise.then(() => {
          return Q.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
        })
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([stepsFilePromise, inFilesPromise, outdirPromise], (steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: ['in'], output: 'out' })
            .then(() => output.get())
        })

        return resultPromise.then(result => {
          return Q.nfcall(rreaddir, 'out').then(outs => {
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.not.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(1)
          })
        })
      }))

      it('should be able to handle directories recursively', testCase(client => {
        let indirPromise = Q.nfcall(fs.mkdir, 'in')
          .then(() => Q.nfcall(fs.mkdir, 'in/sub'))
        let inFilesPromise = indirPromise.then(() => {
          return Q.all(['in/2.jpg', 'in/sub/3.jpg'].map(imgPromise))
        })
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([stepsFilePromise, inFilesPromise, outdirPromise], (steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { recursive: true, steps, inputs: ['in'], output: 'out' })
            .then(() => output.get())
        })

        return resultPromise.then(result => {
          return Q.nfcall(rreaddir, 'out').then(outs => {
            expect(outs).to.include('out/2.jpg')
            expect(outs).to.include('out/sub/3.jpg')
            expect(outs).to.have.lengthOf(2)
          })
        })
      }))

      it('should detect outdir conflicts', testCase(client => {
        let indirPromise = Q.nfcall(fs.mkdir, 'in')
        let inFilesPromise = indirPromise.then(() => {
          return Q.all(['1.jpg', 'in/1.jpg'].map(imgPromise))
        })
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')
        let stepsFilePromise = stepsPromise()

        let errMsgDeferred = Q.defer()

        Q.spread([stepsFilePromise, inFilesPromise, outdirPromise], (steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: ['1.jpg', 'in'], output: 'out' })
            .then(() => errMsgDeferred.reject(new Error('assembliesCreate didnt err; should have')))
            .fail(err => {
              errMsgDeferred.resolve(output.get(), err) // pass err to satisfy linter
            })
        })

        return errMsgDeferred.promise.then(result => {
          expect(result[result.length - 1]).to.have.property('type').that.equals('error')
          expect(result[result.length - 1]).to.have.deep.property('msg.message').that.equals(
            'Output collision between \'in/1.jpg\' and \'1.jpg\'')
        })
      }))

      it('should not download the result if no output is specified', testCase(client => {
        let inFilePromise = imgPromise()
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: [infile], output: null })
            .then(() => output.get(true))
        })

        return resultPromise.then(result => {
          expect(result.filter(line => line.msg === 'DOWNLOADING')).to.have.lengthOf(0)
        })
      }))

      it('should accept invocations with no inputs', testCase(client => {
        let inFilePromise = imgPromise()
        let stepsFilePromise = stepsPromise('steps.json', {
          import: {
            robot: '/http/import',
            url: genericImg
          },
          resize: {
            robot: '/image/resize',
            use: 'import',
            result: true,
            width: 130,
            height: 130
          }
        })

        let resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: [], output: 'out.jpg' })
            .then(() => output.get(true))
        })

        return resultPromise.then(result => Q.nfcall(fs.access, 'out.jpg'))
      }))

      it('should allow deleting inputs after processing', testCase(client => {
        let inFilePromise = imgPromise()
        let stepsFilePromise = stepsPromise()

        let resultPromise = Q.spread([inFilePromise, stepsFilePromise], (infile, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, { steps, inputs: [infile], output: null, del: true })
            .then(() => output.get(true))
        })

        return Q.spread([inFilePromise, resultPromise], infile => {
          return Q.Promise((resolve, reject) => {
            fs.access(infile, err => {
              try {
                expect(err).to.exist
                resolve()
              } catch (err) {
                reject(err)
              }
            })
          })
        })
      }))

      it('should not reprocess inputs that are older than their output', testCase(client => {
        let inFilesPromise = Q.all(['in1.jpg', 'in2.jpg', 'in3.jpg'].map(imgPromise))
        let stepsFilePromise = stepsPromise()
        let outdirPromise = Q.nfcall(fs.mkdir, 'out')

        let resultPromise = Q.spread([inFilesPromise, stepsFilePromise, outdirPromise], (infiles, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, {
            steps,
            inputs: [infiles[0]],
            output: 'out'
          })
        })

        resultPromise = Q.spread([inFilesPromise, stepsFilePromise, resultPromise], (infiles, steps) => {
          let output = new OutputCtl()
          return assembliesCreate(output, client, {
            steps,
            inputs: infiles,
            output: 'out'
          }).then(() => output.get(true))
        })

        return resultPromise.then(result => {
          // assert that no log lines mention the stale input
          expect(result.map(line => line.msg).filter(msg => msg.includes('in1.jpg'))).to.have.lengthOf(0)
        })
      }))
    })
  })
})
