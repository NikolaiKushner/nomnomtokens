import { forecastLimit, moodFor } from '@nomnomtokens/core'

export default defineEventHandler((event) => {
  const q = queries()
  const now = Date.now()
  const since = now - 30 * 24 * 3_600_000

  const windows = q.limitWindows().map((w) => {
    const snapshots = q.limitSnapshots(w.provider, w.window, since)
    const forecast = forecastLimit(snapshots, now)

    // Moments the cap was actually reached, for markers on the history chart.
    const hits: number[] = []
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i]!.usedPct >= 100 && snapshots[i - 1]!.usedPct < 100) {
        hits.push(snapshots[i]!.ts)
      }
    }

    return {
      ...w,
      forecast,
      mood: forecast ? moodFor(forecast.usedPct) : 'hungry',
      hits,
      snapshots: snapshots.map(s => ({ ts: s.ts, usedPct: s.usedPct, resetsAt: s.resetsAt })),
    }
  })

  return { now, windows }
})
