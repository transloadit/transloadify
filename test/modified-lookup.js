import ModifiedLookup from '../src/template-last-modified.js'
import { Transloadit as TransloaditClient } from 'transloadit'
import { assert, describe, it } from 'vitest'
import Q from 'q'
import 'dotenv/config'

let client = new TransloaditClient({
  authKey: process.env.TRANSLOADIT_KEY,
  authSecret: process.env.TRANSLOADIT_SECRET,
})

describe('ModifiedLookup', function () {
  it('should work with empty cache', function () {
    return client.listTemplates({ page: 1, pagesize: 50 }).then(
      ({ items }) => {
        let lookups = items.map((item) => {
          let lookup = new ModifiedLookup(client, 50)

          return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
            const itemTime = Date.parse(item.modified)
            const lookupTime = modified.valueOf()
            if (Math.abs(itemTime - lookupTime) > 10000) {
               assert.fail(`Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`)
            }
          })
        })

        return Q.all(lookups)
      }
    )
  })

  it('should work with full cache', function () {
    return client.listTemplates({ page: 1, pagesize: 50 }).then(
      ({ items }) => {
        let lookup = new ModifiedLookup(client, 50)

        let lookups = items.map((item) => {
          return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
            const itemTime = Date.parse(item.modified)
            const lookupTime = modified.valueOf()
            if (Math.abs(itemTime - lookupTime) > 10000) {
               assert.fail(`Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`)
            }
          })
        })

        return Q.all(lookups)
      }
    )
  })
})
