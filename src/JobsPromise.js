import { EventEmitter } from 'node:events'
import Q from 'q'

export default class JobsPromise extends EventEmitter {
  constructor() {
    super()

    this.promises = new Set()
  }

  add(promise) {
    this.promises.add(promise)
    promise.fin(() => this.promises.delete(promise))
    promise.fail((err) => {
      this.emit('error', err)
    })
  }

  promise() {
    const promises = []
    for (const promise of this.promises) {
      promises.push(promise)
    }
    return Q.all(promises)
  }
}
