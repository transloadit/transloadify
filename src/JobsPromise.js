import Q from 'q'

export default class JobsPromise {
  constructor () {
    this.promises = new Set()
  }

  add (promise) {
    this.promises.add(promise)
    promise.then(() => this.promises.delete(promise))
  }

  promise () {
    let promises = []
    this.promises.forEach(promise => promises.push(promise))
    return Q.all(promises)
  }
}
