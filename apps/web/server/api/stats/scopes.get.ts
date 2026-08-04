import { cacheHitRate } from '@nomnomtokens/core'

export default defineEventHandler((event) => {
  const q = queries()
  const filters = readFilters(event)

  const current = q.byScope(filters)

  // Trend needs the preceding window of equal length. Without a `from` there is
  // no previous period to compare against, so trend is simply absent.
  const span = filters.from !== undefined ? (filters.to ?? Date.now()) - filters.from : null
  const previous = span === null
    ? new Map<string, number>()
    : new Map(
        q.byScope({ ...filters, from: filters.from! - span, to: filters.from })
          .map(r => [r.scopeHash, r.costUsd]),
      )

  return {
    rows: current.map((row) => {
      const before = previous.get(row.scopeHash)
      return {
        ...row,
        cacheHitRate: cacheHitRate({ cacheRead: row.qtyCacheRead, in: row.qtyIn }),
        previousCostUsd: before ?? null,
        trendPct: before !== undefined && before > 0
          ? ((row.costUsd - before) / before) * 100
          : null,
      }
    }),
    hasTrend: span !== null,
  }
})
