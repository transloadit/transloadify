import OutputCtl from './OutputCtl'
import TransloaditClient from 'transloadit'
import fs from 'fs'
import path from 'path'
import Q from 'q'
import rreaddir from 'recursive-readdir'
import { assert } from 'chai'
import { zip } from '../src/helpers'
const templates = require('../src/templates')

const tmpDir = '/tmp'

const authKey = process.env.TRANSLOADIT_KEY
const authSecret = process.env.TRANSLOADIT_SECRET

if (!authKey || !authSecret) {
  console.error('Please provide environment variables TRANSLOADIT_KEY and TRANSLOADIT_SECRET to run tests')
  process.exit()
}

let testno = 0

function testCase(cb) {
  return () => {
    let dirname = path.join(tmpDir, `transloadify_test_${testno++}`) 
    let client = new TransloaditClient({ authKey, authSecret })
    return Q.nfcall(fs.mkdir, dirname)
      .then(() => {
        process.chdir(dirname)
        return cb(client)
      })
      .fin(() => {
        return Q.nfcall(rreaddir, dirname)
          .then(children => {
            children = children.sort((a, b) => b.length - a.length)
            return Q.all(children.map(child => Q.nfcall(fs.unlink, child)))
              .fail(() => {})
          })
          .then(() => Q.nfcall(fs.rmdir, dirname).fail(() => {}))
      })
  }
}

describe("End-to-end", function () {
  this.timeout(100000)

  describe("templates", function () {
    describe("create", function () {
      it("should create templates", testCase(client => {
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
              assert.lengthOf(result, 1)
              assert.propertyVal(result[0], "type", "print")
              assert.equal(result[0].msg, result[0].json.id)
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

    describe("get", function () {
      it("should get templates", testCase(client => {
        // get some valid template IDs to request
        let templateRequests = Q.nfcall(client.listTemplates.bind(client), { pagesize: 5 })
          .then(response => response.items)
          .then(templates => {
            if (templates.length === 0) throw new Error("account has no templates to fetch")
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
            assert.lengthOf(actual, 1)
            assert.propertyVal(actual[0], "type", "print")
            assert.deepEqual(actual[0].json, expectation)
          }))
        })
      }))

      it("should return templates in the order specified", testCase(client => {
        let templateRequests = Q.nfcall(client.listTemplates.bind(client), { pagesize: 5 })
          .then(response => response.items.sort(() => 2 * Math.floor(Math.random() * 2) - 1))
          .then(templates => {
            if (templates.length === 0) throw new Error("account has no templates to fetch")
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
          assert.lengthOf(results, ids.length)
          return Q.all(zip(results, ids).map(([result, id]) => {
            assert.property(result, "type", "print")
            assert.equal(result.json.id, id)
          }))
        })
      }))
    })

    describe("modify", function () {
      let templateId;

      before(function () {
        let client = new TransloaditClient({ authKey, authSecret })
        return Q.nfcall(client.createTemplate.bind(client), {
          name: "originalName",
          template: JSON.stringify({ stage: 0 })
        }).then(response => { templateId = response.id })
      })

      it("should modify but not rename the template", testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, "template.json", JSON.stringify({ stage: 1 }))

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId, 
            file: "template.json"
          }).then(() => output.get())
        })
        
        return resultPromise.then(result => {
          assert.lengthOf(result, 0)
          return Q.nfcall(client.getTemplate.bind(client), templateId)
            .then(template => {
              assert.property(template, "name", "originalName")
              assert.property(template, "content", JSON.stringify({ stage: 1 }))
            })
        })
      }))

      it("should not modify but rename the template", testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, "template.json", "")

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId, 
            name: "newName",
            file: "template.json"
          }).then(() => output.get())
        })
        
        return resultPromise.then(result => {
          assert.lengthOf(result, 0)
          return Q.nfcall(client.getTemplate.bind(client), templateId)
            .then(template => {
              assert.property(template, "name", "newName")
              assert.property(template, "content", JSON.stringify({ stage: 1 }))
            })
        })
      }))

      it("should not modify but rename the template", testCase(client => {
        let filePromise = Q.nfcall(fs.writeFile, "template.json", JSON.stringify({ stage: 2 }))

        let resultPromise = filePromise.then(() => {
          let output = new OutputCtl()
          return templates.modify(output, client, {
            template: templateId, 
            name: "newerName",
            file: "template.json"
          }).then(() => output.get())
        })
        
        return resultPromise.then(result => {
          assert.lengthOf(result, 0)
          return Q.nfcall(client.getTemplate.bind(client), templateId)
            .then(template => {
              assert.property(template, "name", "newerName")
              assert.property(template, "content", JSON.stringify({ stage: 2 }))
            })
        })
      }))

      after(function () {
        let client = new TransloaditClient({ authKey, authSecret })
        return Q.nfcall(client.deleteTemplate.bind(client), templateId)
      })
    })
  })
})
