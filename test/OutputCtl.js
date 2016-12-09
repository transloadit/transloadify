export default class OutputCtl {
  constructor() {
    this.output = []
  }

  error (msg) {
    this.output.push({ type: "error", msg })
  }

  warn (msg) {
    this.output.push({ type: "warn", msg })
  }

  info (msg) {
    this.output.push({ type: "info", msg })
  }

  debug (msg) {
    this.output.push({ type: "debug", msg })
  }
  
  print (msg, json) {
    this.output.push({ type: "print", msg, json })
  }

  get() {
    return this.output
  }
}
