import OutputCtl from './OutputCtl'
import TransloaditClient from 'transloadit'
import fs from 'fs'
import path from 'path'
import Q from 'q'
import rreaddir from 'recursive-readdir'
import { assert } from 'chai'
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
          })
          .then(() => Q.nfcall(fs.rmdir, dirname))
      })
  }
}

describe("End-to-end", function () {
  describe("templates", function () {
    it("should create templates", testCase(client => {
      let executions = [1, 2, 3, 4, 5].map(n => {
        let output = new OutputCtl()
        return Q.nfcall(fs.writeFile, `${n}.json`, JSON.stringify({ testno: n }))
          .then(() => templates.create(output, client, { name: `test_${n}`, file: `${n}.json` }))
          .then(() => output.get())
      })
      
      return Q.all(executions).then(results => {
        return Q.all(results.map(result => {
          return Q.fcall(() => {
            assert.lengthOf(result, 1)
            assert.propertyVal(result[0], "type", "print")
            assert.equal(result[0].msg, result[0].json.id)
          }).fin(() => {
            return Q.nfcall(client.deleteTemplate.bind(client), result[0].json.id)
              .fail(() => {})
          })
        }))
      })
    }))
  })
})
