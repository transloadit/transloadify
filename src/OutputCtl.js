export default class OutputCtl {
  constructor({ logLevel, jsonMode }) {
    this.json = jsonMode
    this.logLevel = logLevel

    // @ts-expect-error
    process.stdout.on('error', (err) => {
      // @ts-expect-error
      if (err.code === 'EPIPE') {
        process.exitCode = 0
      }
    })
    // @ts-expect-error
    process.stderr.on('error', (err) => {
      // @ts-expect-error
      if (err.code === 'EPIPE') {
        process.exitCode = 0
      }
    })
  }

  error(msg) {
    console.error('ERROR  ', msg)
  }

  warn(msg) {
    if (this.logLevel > 0) console.error('WARNING', msg)
  }

  info(msg) {
    if (this.logLevel > 0) console.error('INFO   ', msg)
  }

  debug(msg) {
    if (this.logLevel > 1) console.error('DEBUG  ', msg)
  }

  print(simple, json) {
    if (this.json) console.log(JSON.stringify(json))
    else if (typeof simple === 'string') console.log(simple)
    else console.dir(simple, { depth: null })
  }
}
