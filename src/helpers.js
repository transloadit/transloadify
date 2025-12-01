import fs from 'node:fs'

export function createReadStream(file) {
  if (file === '-') return process.stdin
  return fs.createReadStream(file)
}

export function stream2buf(stream, cb) {
  let size = 0
  const bufs = []

  stream.on('error', cb)

  stream.on('readable', () => {
    const chunk = stream.read()
    if (chunk === null) return

    size += chunk.length
    bufs.push(chunk)
  })

  stream.on('end', () => {
    const buf = new Buffer(size)
    let offset = 0

    for (const b of bufs) {
      b.copy(buf, offset)
      offset += b.length
    }

    cb(null, buf)
  })
}

export function inSequence(promises, fulfilled, rejected) {
  return promises
    .reduce((a, b) => {
      return a.then((...args) => {
        fulfilled(...args)
        return b
      })
    })
    .then(fulfilled)
    .fail(rejected)
}

export function formatAPIError(err) {
  return `${err.error}: ${err.message}`
}

export function zip(...lists) {
  const length = Math.max(...lists.map((list) => list.length))
  const result = new Array(length)
  for (let i = 0; i < result.length; i++) result[i] = lists.map((list) => list[i])
  return result
}
