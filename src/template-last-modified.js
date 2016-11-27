const pagesize = 2

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

function inBetween (a, b, base = 16) {
  a = a.split('').map(s => parseInt(s, base))
  b = b.split('').map(s => parseInt(s, base))

  let c = new Array(Math.max(a.length, b.length) + 1)
  c.fill(0)

    // average the digits (example in base 10): 4 5, 5 9 -> 4.5 7
  for (let i = 1; i <= c.length; i++) {
    let ad = a[a.length - i] || 0
    let bd = a[b.length - i] || 0
    c[c.length - i] = (ad + bd) / 2
  }

    // move value between digits to get integers: 4.5 7 -> 4 12
  for (let i = 0; i < c.length; i++) {
    if (c[i] % 1 !== 0) {
      c[i] = Math.floor(c[i])
      if (i + 1 < c.length) c[i + 1] += base / 2
    }
  }

    // carry: 4 12 -> 5 2. note that avg(45, 59) = 52
  for (let i = 1; i <= c.length; i++) {
    while (c[c.length - i] >= base) {
      c[c.length - i - 1] += 1
      c[c.length - i] -= base
    }
  }

    // drop leading 0s
  while (c[0] === 0) c.shift()

  return c.map(d => d.toString(base)).join('')
}

function double (a, base = 16) {
  a = a.split('').map(s => 2 * parseInt(s, base))
  a.unshift(0)

  let carry = 0
  for (let i = a.length - 1; i >= 0; i--) {
    a[i] += carry
    carry = 0
    while (a[i] >= base) {
      a[i] -= base
      carry += 1
    }
  }

  while (a[0] === 0) a.shift()

  return a.map(d => d.toString(base)).join('')
}

export default class ModifiedLookup {
  constructor (client) {
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
    id = parseInt(id, 16)

    let findUpperBound, refine, complete

    findUpperBound = bound => {
      this.idByOrd(bound, (err, idAtBound) => {
        if (err) return cb(err)
        if (idAtBound === id) return complete(bound)
        if (idAtBound > id) return refine(inBetween('0', bound), bound)
        findUpperBound(double(bound))
      })
    }

    refine = (lower, upper) => {
      let middle = inBetween(lower, upper)
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
