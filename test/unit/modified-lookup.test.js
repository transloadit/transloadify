import Q from 'q'
import { Transloadit as TransloaditClient } from 'transloadit'
import { assert, describe, it } from 'vitest'
import ModifiedLookup from '../../src/template-last-modified.js'
import 'dotenv/config'

const client = new TransloaditClient({
  authKey: process.env.TRANSLOADIT_KEY,
  authSecret: process.env.TRANSLOADIT_SECRET,
})

describe('ModifiedLookup', () => {
  it('should work with empty cache', () =>
    client.listTemplates({ page: 1, pagesize: 50 }).then(({ items }) => {
      const lookups = items.map((item) => {
        const lookup = new ModifiedLookup(client, 50)

        return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
          const itemTime = Date.parse(item.modified)
          const lookupTime = modified.valueOf()
          if (Math.abs(itemTime - lookupTime) > 10000) {
            assert.fail(
              `Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`,
            )
          }
        })
      })

      return Q.all(lookups)
    }))

  it('should work with full cache', () =>
    client.listTemplates({ page: 1, pagesize: 50 }).then(({ items }) => {
      const lookup = new ModifiedLookup(client, 50)

      const lookups = items.map((item) => {
        return Q.nfcall(lookup.byId.bind(lookup), item.id).then((modified) => {
          const itemTime = Date.parse(item.modified)
          const lookupTime = modified.valueOf()
          if (Math.abs(itemTime - lookupTime) > 10000) {
            assert.fail(
              `Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`,
            )
          }
        })
      })

      return Q.all(lookups)
    }))
})
