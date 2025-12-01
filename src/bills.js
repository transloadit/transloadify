import Q from 'q'
import { formatAPIError, inSequence } from './helpers.js'

export function get(output, client, { months }) {
  let requests = months.map((month) => {
    return Q.resolve(client.getBill(month))
  })

  inSequence(
    requests,
    (result) => {
      output.print(`$${result.total}`, result)
    },
    (err) => {
      output.error(formatAPIError(err))
    },
  )
}
