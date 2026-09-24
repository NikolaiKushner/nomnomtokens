import { currentWindowSnapshots } from './forecast.js'

/** One model must own at least this share of priced cost for a gap to count. */
export const WEIGH_CLEAN_SHARE = 0.8
/** Fewer clean gaps than this and the model stays unknown — no invented rate. */
export const WEIGH_MIN_CLEAN = 3

export interface WeighSlice {
  unitLabel: string | null
  /** Priced list-price dollars only. Null-cost events must not be passed as 0. */
  costUsd: number
}

/** One step between two limit snapshots. */
export interface WeighGap {
  deltaPct: number
  models: WeighSlice[]
}

export interface WeighBand {
  median: number
  p25: number
  p75: number
}

export interface WeighModel {
  unitLabel: string | null
  ppPerUsd: WeighBand | null
  cleanIntervals: number
  status: 'ok' | 'unknown'
}

export interface WeighReport {
  window: '7d'
  provider: 'claude-code'
  /** Pooled percentage points per list-price dollar across every rising gap. */
  blendedPpPerUsd: number | null
  risingIntervals: number
  cleanIntervals: number
  models: WeighModel[]
  caveats: string[]
}

export interface RisingPair {
  /** inclusive */
  from: number
  /** exclusive — an event on this ts belongs to the next gap */
  to: number
  deltaPct: number
}

const CAVEATS = [
  'Points per dollar use the list price stored now, not Anthropic\'s undocumented meter unit.',
  'A gap counts for a model only when that model is at least 80% of priced cost.',
  'Local used% is this machine only — other devices and claude.ai sit in the percent and not in the log.',
]

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  const a = sorted[lo]!
  const b = sorted[hi]!
  return a + (b - a) * (idx - lo)
}

function band(rates: number[]): WeighBand {
  const sorted = [...rates].sort((a, b) => a - b)
  return {
    p25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    p75: quantile(sorted, 0.75),
  }
}

function priced(models: WeighSlice[]): WeighSlice[] {
  return models.filter(m => m.costUsd > 0)
}

/**
 * Consecutive snapshots inside the current fill, where used% rose.
 * A reset (used% fell) starts a new window via `currentWindowSnapshots`
 * and never produces a negative weight.
 */
export function pairRisingSnapshots(
  snapshots: Array<{ ts: number, usedPct: number }>,
): RisingPair[] {
  const current = currentWindowSnapshots(snapshots)
  const pairs: RisingPair[] = []
  for (let i = 1; i < current.length; i++) {
    const prev = current[i - 1]!
    const next = current[i]!
    const deltaPct = next.usedPct - prev.usedPct
    if (deltaPct <= 0) continue
    pairs.push({ from: prev.ts, to: next.ts, deltaPct })
  }
  return pairs
}

/**
 * How many weekly percentage points one list-price dollar moved, per model.
 * Mixed gaps stay in the blended pool and out of any model's median.
 */
export function buildWeigh(gaps: WeighGap[]): WeighReport {
  let risingPct = 0
  let risingUsd = 0
  let risingIntervals = 0
  let cleanIntervals = 0
  const byLabel = new Map<string, { label: string | null, rates: number[] }>()

  for (const gap of gaps) {
    if (gap.deltaPct <= 0) continue
    const models = priced(gap.models)
    const total = models.reduce((s, m) => s + m.costUsd, 0)
    if (total <= 0) continue

    risingIntervals += 1
    risingPct += gap.deltaPct
    risingUsd += total
    const rate = gap.deltaPct / total

    const dominant = models.reduce((a, b) => (b.costUsd > a.costUsd ? b : a))
    if (dominant.costUsd + 1e-9 < total * WEIGH_CLEAN_SHARE) continue

    cleanIntervals += 1
    const key = dominant.unitLabel ?? ''
    const row = byLabel.get(key) ?? { label: dominant.unitLabel, rates: [] }
    row.rates.push(rate)
    byLabel.set(key, row)
  }

  const models: WeighModel[] = [...byLabel.values()]
    .map((row) => {
      const ok = row.rates.length >= WEIGH_MIN_CLEAN
      return {
        unitLabel: row.label,
        ppPerUsd: ok ? band(row.rates) : null,
        cleanIntervals: row.rates.length,
        status: ok ? 'ok' as const : 'unknown' as const,
      }
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ok' ? -1 : 1
      return (b.ppPerUsd?.median ?? 0) - (a.ppPerUsd?.median ?? 0)
    })

  return {
    window: '7d',
    provider: 'claude-code',
    blendedPpPerUsd: risingUsd > 0 ? risingPct / risingUsd : null,
    risingIntervals,
    cleanIntervals,
    models,
    caveats: CAVEATS,
  }
}
