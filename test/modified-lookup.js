import ModifiedLookup from '../src/template-last-modified'
import TransloaditClient from 'transloadit'
import { assert } from 'chai'
import Q from 'q'

let client = new TransloaditClient({
  authKey: process.env.TRANSLOADIT_KEY,
  authSecret: process.env.TRANSLOADIT_SECRET
})

describe('ModifiedLookup', function () {
  this.timeout(100000)

  it('should work with empty cache', function () {
    return Q.nfcall(client.listTemplates.bind(client), { page: 1, pagesize: 50 })
      .then(({ items }) => {
        let lookups = items.map(item => {
          let lookup = new ModifiedLookup(client, 2)

          return Q.nfcall(lookup.byId.bind(lookup), item.id)
            .then(modified => {
              assert.equal(item.modified, modified)
            })
        })

        return Q.all(lookups)
      })
  })

  it('should work with full cache', function () {
    return Q.nfcall(client.listTemplates.bind(client), { page: 1, pagesize: 50 })
      .then(({ items }) => {
        let lookup = new ModifiedLookup(client, 2)

        let lookups = items.map(item => {
          return Q.nfcall(lookup.byId.bind(lookup), item.id)
            .then(modified => {
              assert.equal(item.modified, modified)
            })
        })

        return Q.all(lookups)
      })
  })

})
