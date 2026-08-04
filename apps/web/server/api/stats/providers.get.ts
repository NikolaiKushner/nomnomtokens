import { cacheHitRate, costPerKLines } from '@nomnomtokens/core'

export default defineEventHandler((event) => {
  const q = queries()
  const filters = readFilters(event)

  const providers = q.byProvider(filters).map((row) => {
    const lines = q.lineTotals({ ...filters, provider: [row.provider] })
    return {
      ...row,
      cacheHitRate: cacheHitRate({ cacheRead: row.qtyCacheRead, in: row.qtyIn }),
      costPerKLines: costPerKLines(row.costUsd, {
        linesAdded: lines.added,
        linesRemoved: lines.removed,
      }),
      linesChanged: lines.added + lines.removed,
    }
  })

  return {
    providers,
    models: q.byUnitLabel(filters).map(row => ({
      ...row,
      cacheHitRate: cacheHitRate({ cacheRead: row.qtyCacheRead, in: row.qtyIn }),
    })),
  }
})
