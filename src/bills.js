import { formatAPIError } from './helpers.js'

export async function get(output, client, { months }) {
  const requests = months.map((month) => {
    return client.getBill(month)
  })

  try {
    const results = await Promise.all(requests)
    for (const result of results) {
      output.print(`$${result.total}`, result)
    }
  } catch (err) {
    output.error(formatAPIError(err))
  }
}
