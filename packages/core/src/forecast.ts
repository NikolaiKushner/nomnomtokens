import type { LimitSnapshot } from './types.js'

export interface Line { slope: number, intercept: number }

/** Ordinary least squares. Returns null when the points can't define a line. */
export function linearRegression(points: Array<{ x: number, y: number }>): Line | null {
  const n = points.length
  if (n < 2) return null

  let sx = 0, sy = 0, sxx = 0, sxy = 0
  for (const { x, y } of points) {
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const denom = n * sxx - sx * sx
  if (denom === 0) return null

  const slope = (n * sxy - sx * sy) / denom
  return { slope, intercept: (sy - slope * sx) / n }
}

export interface LimitForecast {
  provider: string
  window: string
  usedPct: number
  /** percentage points per hour */
  burnRatePctPerHour: number
  /** unix ms when the window is projected to hit 100%, or null if it won't */
  exhaustsAt: number | null
  /** when the window resets regardless of usage */
  resetsAt: number | null
  /** true when the projection lands before the reset — i.e. you will actually hit the cap */
  willExhaustBeforeReset: boolean
  /** how many snapshots the projection is based on */
  samples: number
}

/**
 * Snapshots belonging to the current fill cycle (after the last reset).
 *
 * A reset makes usedPct fall off a cliff; charts and regressions that span that
 * discontinuity draw a fake V and invent a nonsense burn rate.
 */
export function currentWindowSnapshots<T extends { usedPct: number, ts: number }>(
  snapshots: T[],
): T[] {
  if (snapshots.length === 0) return []
  const sorted = [...snapshots].sort((a, b) => a.ts - b.ts)
  let start = sorted.length - 1
  while (start > 0 && sorted[start - 1]!.usedPct <= sorted[start]!.usedPct) start -= 1
  return sorted.slice(start)
}

/**
 * Project when a limit window fills.
 *
 * Snapshots are per (provider, window) and must be sorted by ts. We regress
 * only over the current window — a reset makes usedPct fall off a cliff, and
 * fitting across that discontinuity produces a negative burn rate and a
 * confidently wrong "you'll never hit the cap".
 */
export function forecastLimit(snapshots: LimitSnapshot[], now = Date.now()): LimitForecast | null {
  if (snapshots.length === 0) return null

  const current = currentWindowSnapshots(snapshots)
  const last = current[current.length - 1]!

  const hours = (ts: number) => (ts - current[0]!.ts) / 3_600_000
  const fit = linearRegression(current.map(s => ({ x: hours(s.ts), y: s.usedPct })))

  const burn = fit && fit.slope > 0 ? fit.slope : 0
  let exhaustsAt: number | null = null
  if (burn > 0) {
    const hoursToFull = (100 - last.usedPct) / burn
    if (hoursToFull >= 0 && Number.isFinite(hoursToFull)) {
      exhaustsAt = now + hoursToFull * 3_600_000
    }
  }

  return {
    provider: last.provider,
    window: last.window,
    usedPct: last.usedPct,
    burnRatePctPerHour: burn,
    exhaustsAt,
    resetsAt: last.resetsAt,
    willExhaustBeforeReset:
      exhaustsAt !== null && (last.resetsAt === null || exhaustsAt < last.resetsAt),
    samples: current.length,
  }
}

/** Extrapolate a spend series to the end of a period (e.g. month-to-date -> month-end). */
export function projectSpend(
  points: Array<{ ts: number, costUsd: number }>,
  periodEnd: number,
): number | null {
  if (points.length === 0) return null
  const sorted = [...points].sort((a, b) => a.ts - b.ts)
  const first = sorted[0]!.ts
  const spent = sorted.reduce((s, p) => s + p.costUsd, 0)
  const elapsed = (sorted[sorted.length - 1]!.ts - first) || 1
  const remaining = periodEnd - sorted[sorted.length - 1]!.ts
  if (remaining <= 0) return spent
  return spent + (spent / elapsed) * remaining
}

/**
 * The mascot's mood. Purely cosmetic, but it is the product's differentiator —
 * so it lives in core next to the number that drives it, not in a component.
 */
export type Mood = 'hungry' | 'content' | 'full' | 'stuffed' | 'overstuffed'

export function moodFor(usedPct: number): Mood {
  if (usedPct < 5) return 'hungry'
  if (usedPct < 50) return 'content'
  if (usedPct < 80) return 'full'
  if (usedPct < 100) return 'stuffed'
  return 'overstuffed'
}
