import Q from 'q'
import { EventEmitter } from 'events'

export default class JobsPromise extends EventEmitter {
  constructor () {
    super()

    this.promises = new Set()
  }

  add (promise) {
    this.promises.add(promise)
    promise.fin(() => this.promises.delete(promise))
    promise.fail(err => {
      this.emit('error', err)
    })
  }

  promise () {
    let promises = []
    this.promises.forEach(promise => promises.push(promise))
    return Q.all(promises)
  }
}
