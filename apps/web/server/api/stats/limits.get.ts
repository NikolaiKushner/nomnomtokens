import { currentWindowSnapshots, forecastLimit, moodFor } from '@nomnomtokens/core'

export default defineEventHandler((event) => {
  const q = queries()
  const now = Date.now()
  const since = now - 30 * 24 * 3_600_000

  const windows = q.limitWindows().map((w) => {
    const all = q.limitSnapshots(w.provider, w.window, since)
    const forecast = forecastLimit(all, now)
    // Chart the current fill cycle only — spanning a reset draws a fake V.
    const snapshots = currentWindowSnapshots(all)

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
