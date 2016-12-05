class MemoizedPagination {
  constructor (pagesize, fetch) {
    this.pagesize = pagesize
    this.fetch = fetch
    this.cache = []
  }

  get (i, cb) {
    if (i in this.cache) return cb(null, this.cache[i])

    let page = Math.floor(i / this.pagesize) + 1

    let start = (page - 1) * this.pagesize

    this.fetch(page, this.pagesize, (err, result) => {
      if (err) return cb(err)
      for (let j = 0; j < this.pagesize; j++) {
        this.cache[start + j] = result[j]
      }
      cb(null, this.cache[i])
    })
  }
}

export default class ModifiedLookup {
  constructor (client, pagesize=50) {
    this.byOrdinal = new MemoizedPagination(pagesize, (page, pagesize, cb) => {
      let params = {
        sort: 'id',
        order: 'asc',
        fields: ['id', 'modified'],
        page,
        pagesize
      }
      client.listTemplates(params, (err, result) => {
        if (err) return cb(err)
        let items = new Array(pagesize)
        items.fill({ id: 'fffffffffffffffffffffffffffffff' })
        for (let i = 0; i < result.items.length; i++) {
          items[i] = result.items[i]
        }
        cb(null, items)
      })
    })
  }

  idByOrd (ord, cb) {
    this.byOrdinal.get(ord, (err, result) => {
      if (err) return cb(err)
      cb(null, result.id)
    })
  }

  byId (id, cb) {
    let findUpperBound, refine, complete

    findUpperBound = bound => {
      this.idByOrd(bound, (err, idAtBound) => {
        if (err) return cb(err)
        if (idAtBound === id) return complete(bound)
        if (idAtBound > id) return refine(Math.floor(bound / 2), bound)
        findUpperBound(bound * 2)
      })
    }

    refine = (lower, upper) => {
      let middle = Math.floor((lower + upper) / 2)
      this.idByOrd(middle, (err, idAtMiddle) => {
        if (err) return cb(err)
        if (idAtMiddle === id) return complete(middle)
        if (idAtMiddle < id) return refine(middle, upper)
        refine(lower, middle)
      })
    }

    complete = ord => {
      this.byOrdinal.get(ord, (err, result) => {
        if (err) return cb(err)
        cb(null, result.modified)
      })
    }

    findUpperBound(1)
  }
}
