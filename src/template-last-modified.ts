import type { Transloadit } from 'transloadit'

interface TemplateItem {
  id: string
  modified: string
}

type FetchCallback<T> = (err: Error | null, result?: T) => void
type PageFetcher<T> = (page: number, pagesize: number, cb: FetchCallback<T[]>) => void

class MemoizedPagination<T> {
  private pagesize: number
  private fetch: PageFetcher<T>
  private cache: (T | undefined)[]

  constructor(pagesize: number, fetch: PageFetcher<T>) {
    this.pagesize = pagesize
    this.fetch = fetch
    this.cache = []
  }

  get(i: number, cb: FetchCallback<T>): void {
    const cached = this.cache[i]
    if (cached !== undefined) {
      return process.nextTick(() => cb(null, cached))
    }

    const page = Math.floor(i / this.pagesize) + 1
    const start = (page - 1) * this.pagesize

    this.fetch(page, this.pagesize, (err, result) => {
      if (err) return cb(err)
      if (!result) return cb(new Error('No result returned from fetch'))
      for (let j = 0; j < this.pagesize; j++) {
        this.cache[start + j] = result[j]
      }
      cb(null, this.cache[i])
    })
  }
}

export default class ModifiedLookup {
  private byOrdinal: MemoizedPagination<TemplateItem>

  constructor(client: Transloadit, pagesize = 50) {
    this.byOrdinal = new MemoizedPagination<TemplateItem>(pagesize, async (page, pagesize, cb) => {
      const params = {
        sort: 'id' as const,
        order: 'asc' as const,
        fields: ['id', 'modified'] as ('id' | 'modified')[],
        page,
        pagesize,
      }
      try {
        const result = await client.listTemplates(params)
        const items: TemplateItem[] = new Array(pagesize)
        // Fill with sentinel value larger than any hex ID
        items.fill({ id: 'gggggggggggggggggggggggggggggggg', modified: '' })
        for (let i = 0; i < result.items.length; i++) {
          const item = result.items[i]
          if (item) {
            items[i] = { id: item.id, modified: item.modified }
          }
        }
        cb(null, items)
      } catch (err) {
        cb(err as Error)
      }
    })
  }

  private idByOrd(ord: number, cb: FetchCallback<string>): void {
    this.byOrdinal.get(ord, (err, result) => {
      if (err) return cb(err)
      if (!result) return cb(new Error('No result found'))
      cb(null, result.id)
    })
  }

  byId(id: string, cb: FetchCallback<Date>): void {
    const findUpperBound = (bound: number): void => {
      this.idByOrd(bound, (err, idAtBound) => {
        if (err) return cb(err)
        if (idAtBound === id) return complete(bound)
        if (idAtBound && idAtBound > id) return refine(Math.floor(bound / 2), bound)
        findUpperBound(bound * 2)
      })
    }

    const refine = (lower: number, upper: number): void => {
      if (lower >= upper - 1) {
        return cb(new Error(`Template ID ${id} not found in ModifiedLookup`))
      }

      const middle = Math.floor((lower + upper) / 2)
      this.idByOrd(middle, (err, idAtMiddle) => {
        if (err) return cb(err)
        if (idAtMiddle === id) return complete(middle)
        if (idAtMiddle && idAtMiddle < id) return refine(middle, upper)
        refine(lower, middle)
      })
    }

    const complete = (ord: number): void => {
      this.byOrdinal.get(ord, (err, result) => {
        if (err) return cb(err)
        if (!result) return cb(new Error('No result found'))
        cb(null, new Date(result.modified))
      })
    }

    findUpperBound(1)
  }
}
