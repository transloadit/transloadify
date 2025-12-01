import ModifiedLookup from '../src/template-last-modified.js'
import { Transloadit as TransloaditClient } from 'transloadit'
import { assert } from 'chai'
import Q from 'q'
import 'dotenv/config'

let client = new TransloaditClient({
  authKey: process.env.TRANSLOADIT_KEY,
  authSecret: process.env.TRANSLOADIT_SECRET,
})

describe('ModifiedLookup', function () {
  this.timeout(100000)

  it('should work with empty cache', function () {
    return client.listTemplates({ page: 1, pagesize: 50 }).then(
      ({ items }) => {
        let lookups = items.map((item) => {
          let lookup = new ModifiedLookup(client, 2)

          return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
            assert.equal(Date.parse(item.modified), modified.valueOf())
          })
        })

        return Q.all(lookups)
      }
    )
  })

  it('should work with full cache', function () {
    return client.listTemplates({ page: 1, pagesize: 50 }).then(
      ({ items }) => {
        let lookup = new ModifiedLookup(client, 2)

        let lookups = items.map((item) => {
          return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
            assert.equal(Date.parse(item.modified), modified.valueOf())
          })
        })

        return Q.all(lookups)
      }
    )
  })
})
