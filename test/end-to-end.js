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
        let templateRequests = Q.nfcall(client.listTemplates.bind(client), { pagesize: 1 })
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
    })
  })
})
