import type { Transloadit } from 'transloadit'
import type { APIError } from './helpers.js'
import { formatAPIError } from './helpers.js'
import type { IOutputCtl } from './OutputCtl.js'

export interface BillsGetOptions {
  months: string[]
}

export async function get(
  output: IOutputCtl,
  client: Transloadit,
  { months }: BillsGetOptions,
): Promise<void> {
  const requests = months.map((month) => {
    return client.getBill(month)
  })

  try {
    const results = await Promise.all(requests)
    for (const result of results) {
      output.print(`$${(result as { total: number }).total}`, result)
    }
  } catch (err) {
    output.error(formatAPIError(err as APIError))
  }
}
