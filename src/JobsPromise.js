import { EventEmitter } from 'node:events'

export default class JobsPromise extends EventEmitter {
  constructor() {
    super()

    this.promises = new Set()
  }

  add(promise) {
    this.promises.add(promise)
    promise.finally(() => this.promises.delete(promise)).catch((err) => {
      this.emit('error', err)
    })
  }

  promise() {
    const promises = []
    for (const promise of this.promises) {
      promises.push(promise)
    }
    return Promise.all(promises)
  }
}
