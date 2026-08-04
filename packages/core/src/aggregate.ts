import type { SpendEvent } from './types.js'
import { totalTokens } from './types.js'

export type Granularity = 'hour' | 'day' | 'week' | 'month'

export interface Totals {
  costUsd: number
  /** null when at least one contributing event had no price */
  costComplete: boolean
  tokens: number
  qty: Record<string, number>
  events: number
  sessions: number
}

export function emptyTotals(): Totals {
  return { costUsd: 0, costComplete: true, tokens: 0, qty: {}, events: 0, sessions: 0 }
}

export function addEvent(t: Totals, e: SpendEvent, seenSessions?: Set<string>): Totals {
  t.events += 1
  t.tokens += totalTokens(e.qty)
  for (const [k, v] of Object.entries(e.qty)) t.qty[k] = (t.qty[k] ?? 0) + v
  if (e.costUsd === null) t.costComplete = false
  else t.costUsd += e.costUsd
  if (e.sessionId && seenSessions && !seenSessions.has(e.sessionId)) {
    seenSessions.add(e.sessionId)
    t.sessions += 1
  }
  return t
}

export function sumEvents(events: Iterable<SpendEvent>): Totals {
  const t = emptyTotals()
  const sessions = new Set<string>()
  for (const e of events) addEvent(t, e, sessions)
  return t
}

/**
 * Bucket start in local time. Local, not UTC: "eaten today" has to mean the
 * user's today, or the headline number is wrong for most of the planet.
 */
export function bucketStart(ts: number, g: Granularity): number {
  const d = new Date(ts)
  switch (g) {
    case 'hour':
      d.setMinutes(0, 0, 0)
      return d.getTime()
    case 'day':
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    case 'week': {
      d.setHours(0, 0, 0, 0)
      // ISO weeks start Monday
      const shift = (d.getDay() + 6) % 7
      d.setDate(d.getDate() - shift)
      return d.getTime()
    }
    case 'month':
      d.setHours(0, 0, 0, 0)
      d.setDate(1)
      return d.getTime()
  }
}

export interface Point {
  ts: number
  totals: Totals
}

export function timeSeries(events: Iterable<SpendEvent>, g: Granularity): Point[] {
  const buckets = new Map<number, { totals: Totals, sessions: Set<string> }>()
  for (const e of events) {
    const key = bucketStart(e.ts, g)
    let b = buckets.get(key)
    if (!b) {
      b = { totals: emptyTotals(), sessions: new Set() }
      buckets.set(key, b)
    }
    addEvent(b.totals, e, b.sessions)
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, b]) => ({ ts, totals: b.totals }))
}

/** hour-of-day x day-of-week grid, GitHub-contributions style. */
export interface HeatCell { weekday: number, hour: number, value: number }

export function heatmap(
  events: Iterable<SpendEvent>,
  metric: (e: SpendEvent) => number = e => e.costUsd ?? 0,
): HeatCell[] {
  const grid = new Float64Array(7 * 24)
  for (const e of events) {
    const d = new Date(e.ts)
    grid[d.getDay() * 24 + d.getHours()]! += metric(e)
  }
  const cells: HeatCell[] = []
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      cells.push({ weekday, hour, value: grid[weekday * 24 + hour]! })
    }
  }
  return cells
}

/**
 * Cache hit rate — cacheRead / (cacheRead + in). The single most useful
 * efficiency number for an agent: it says how much of the context you are
 * re-reading at 10% price instead of paying full freight for.
 */
export function cacheHitRate(qty: Record<string, number>): number | null {
  const read = qty.cacheRead ?? 0
  const fresh = qty.in ?? 0
  const denom = read + fresh
  return denom === 0 ? null : read / denom
}

/** Cost per 1,000 changed lines — the "what did this actually buy me" metric. */
export function costPerKLines(costUsd: number, meta: Record<string, number>): number | null {
  const lines = (meta.linesAdded ?? 0) + (meta.linesRemoved ?? 0)
  return lines === 0 ? null : (costUsd / lines) * 1000
}
