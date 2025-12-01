import { promisify } from 'node:util'
import { Transloadit as TransloaditClient } from 'transloadit'
import { assert, describe, it } from 'vitest'
import ModifiedLookup from '../../src/template-last-modified.js'
import 'dotenv/config'

const client = new TransloaditClient({
  authKey: process.env.TRANSLOADIT_KEY,
  authSecret: process.env.TRANSLOADIT_SECRET,
})

describe('ModifiedLookup', () => {
  it('should work with empty cache', async () => {
    const { items } = await client.listTemplates({ page: 1, pagesize: 50 })
    const lookups = items.map(async (item) => {
      const lookup = new ModifiedLookup(client, 50)
      const byIdAsync = promisify(lookup.byId.bind(lookup))

      const modified = await byIdAsync(item.id)
      const itemTime = Date.parse(item.modified)
      const lookupTime = modified.valueOf()
      if (Math.abs(itemTime - lookupTime) > 10000) {
        assert.fail(
          `Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`,
        )
      }
    })

    await Promise.all(lookups)
  })

  it('should work with full cache', async () => {
    const { items } = await client.listTemplates({ page: 1, pagesize: 50 })
    const lookup = new ModifiedLookup(client, 50)
    const byIdAsync = promisify(lookup.byId.bind(lookup))

    const lookups = items.map(async (item) => {
      const modified = await byIdAsync(item.id)
      const itemTime = Date.parse(item.modified)
      const lookupTime = modified.valueOf()
      if (Math.abs(itemTime - lookupTime) > 10000) {
        assert.fail(
          `Timestamp mismatch: item ${itemTime} vs lookup ${lookupTime} (diff ${itemTime - lookupTime}ms)`,
        )
      }
    })

    await Promise.all(lookups)
  })
})
