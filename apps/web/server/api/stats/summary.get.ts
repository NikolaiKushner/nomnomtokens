import { bucketStart, cacheHitRate, costPerKLines, forecastLimit } from '@nomnomtokens/core'

/**
 * The Overview payload: the headline numbers, plus everything the mascot and
 * the limits widget need, in one round trip.
 */
export default defineEventHandler((event) => {
  const q = queries()
  const filters = readFilters(event)
  const now = Date.now()

  const windows = {
    today: bucketStart(now, 'day'),
    week: bucketStart(now, 'week'),
    month: bucketStart(now, 'month'),
  }

  const scoped = { provider: filters.provider, scopeHash: filters.scopeHash, kind: 'tokens' }

  const totals = {
    today: q.totals({ ...scoped, from: windows.today }),
    week: q.totals({ ...scoped, from: windows.week }),
    month: q.totals({ ...scoped, from: windows.month }),
    range: q.totals(filters),
  }

  // 24 hourly points for the headline sparkline
  const sparkline = q.series('hour', { ...scoped, from: now - 24 * 3_600_000 })

  const lines = q.lineTotals(filters)

  const limits = q.limitWindows().map((w) => {
    const snapshots = q.limitSnapshots(w.provider, w.window, now - 14 * 24 * 3_600_000)
    return forecastLimit(snapshots, now)
  }).filter(Boolean)

  return {
    now,
    range: filters.range,
    totals,
    sparkline: sparkline.map(p => ({ bucket: p.bucket, costUsd: p.costUsd, tokens: p.tokens })),
    efficiency: {
      cacheHitRate: cacheHitRate({
        cacheRead: totals.range.qtyCacheRead,
        in: totals.range.qtyIn,
      }),
      costPerKLines: costPerKLines(totals.range.costUsd, {
        linesAdded: lines.added,
        linesRemoved: lines.removed,
      }),
      linesChanged: lines.added + lines.removed,
    },
    limits,
  }
})
