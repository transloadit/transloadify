import type { Transloadit } from 'transloadit'
import { z } from 'zod'
import { formatAPIError } from './helpers.ts'
import type { IOutputCtl } from './OutputCtl.ts'

export interface BillsGetOptions {
  months: string[]
}

const BillResponseSchema = z.object({
  total: z.number(),
})

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
      const parsed = BillResponseSchema.safeParse(result)
      if (parsed.success) {
        output.print(`$${parsed.data.total}`, result)
      } else {
        output.print('Unable to parse bill response', result)
      }
    }
  } catch (err) {
    output.error(formatAPIError(err))
  }
}
