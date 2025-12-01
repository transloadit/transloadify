import { formatAPIError, inSequence } from './helpers.js'
import Q from 'q'

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
    }
  )
}
