import { currentWindowSnapshots, forecastLimit } from './forecast.js'
import type { LimitSnapshot } from './types.js'

/**
 * Dated *estimates* of how Max plan names map onto 5h vs weekly pools.
 *
 * Anthropic does not publish a stable weekly multiplier. 20x is the 5-hour
 * burst, not 4× weekly; public reconstructions in late 2026 put weekly 20x
 * closer to ~1.7× Max 5x. Treat every number here as an error bar, not a bill.
 */
export const PLAN_ESTIMATES = {
  asOf: '2026-09-02',
  fiveHourVsPro: { pro: 1, max5x: 5, max20x: 20 },
  /** Weekly pool vs Pro — the 20x weekly bump is much smaller than the name. */
  weeklyVsPro: { pro: 1, max5x: 5, max20x: 8.5 },
} as const

export type PlanTier = 'pro' | 'max5x' | 'max20x' | 'above-20x' | 'unknown'

export interface VerdictInput {
  weekly: LimitSnapshot[]
  fiveHour: LimitSnapshot[]
  /** list-price $ over the last 7 days (context only) */
  weeklyCostUsd: number
  now?: number
}

export interface VerdictReport {
  recommended: PlanTier
  weeklyBound: boolean
  weeklyUsedPct: number | null
  fiveHourUsedPct: number | null
  weeklyCostUsd: number
  two5xVs20x: {
    two5xWins: boolean
    reason: string
  }
  estimatesAsOf: string
  caveats: string[]
}

function latestPct(snapshots: LimitSnapshot[]): number | null {
  if (snapshots.length === 0) return null
  const current = currentWindowSnapshots(snapshots)
  const last = current[current.length - 1]
  return last ? last.usedPct : null
}

function elapsedWeekFraction(snapshots: LimitSnapshot[], now: number): number | null {
  const current = currentWindowSnapshots(snapshots)
  const last = current[current.length - 1]
  if (!last) return null
  const weekMs = 7 * 24 * 3_600_000
  if (last.resetsAt && last.resetsAt > now) {
    const remaining = last.resetsAt - now
    const elapsed = weekMs - remaining
    if (elapsed <= 0) return 0.01
    return Math.min(1, Math.max(0.01, elapsed / weekMs))
  }
  if (current.length < 2) return null
  const span = last.ts - current[0]!.ts
  return Math.min(1, Math.max(0.01, span / weekMs))
}

/**
 * Infer which named Claude plan would cover this machine's *weekly* fill,
 * not the name printed on the subscription. Unknown when we have no 7d
 * snapshots — we will not guess Pro from an empty store.
 */
export function buildVerdict(input: VerdictInput): VerdictReport {
  const now = input.now ?? Date.now()
  const weeklyUsedPct = latestPct(input.weekly)
  const fiveHourUsedPct = latestPct(input.fiveHour)
  const fc7 = forecastLimit(input.weekly, now)
  const fc5 = forecastLimit(input.fiveHour, now)

  const caveats = [
    `Plan multipliers are estimates as of ${PLAN_ESTIMATES.asOf}, not Anthropic's bill.`,
    '"20x" multiplies the 5-hour window; weekly headroom grows much less (two Max 5x accounts often beat one 20x).',
    'Local used% is this machine only — other devices and claude.ai are invisible.',
  ]

  if (weeklyUsedPct === null) {
    return {
      recommended: 'unknown',
      weeklyBound: false,
      weeklyUsedPct: null,
      fiveHourUsedPct,
      weeklyCostUsd: input.weeklyCostUsd,
      two5xVs20x: {
        two5xWins: false,
        reason: 'No 7-day limit snapshots yet — run `nnt init` so the status line records weekly fill.',
      },
      estimatesAsOf: PLAN_ESTIMATES.asOf,
      caveats,
    }
  }

  const weeklyBound
    = (fiveHourUsedPct === null || weeklyUsedPct >= fiveHourUsedPct)
      || Boolean(fc7?.willExhaustBeforeReset && !fc5?.willExhaustBeforeReset)

  const elapsed = elapsedWeekFraction(input.weekly, now)
  const pace = elapsed ? weeklyUsedPct / elapsed : weeklyUsedPct

  let recommended: PlanTier
  if (pace >= 180 || weeklyUsedPct >= 98) {
    recommended = 'above-20x'
  } else if (weeklyBound && (weeklyUsedPct >= 85 || fc7?.willExhaustBeforeReset)) {
    recommended = weeklyUsedPct >= 92 ? 'above-20x' : 'max20x'
  } else if ((fiveHourUsedPct ?? 0) >= 90 || fc5?.willExhaustBeforeReset) {
    recommended = 'max20x'
  } else if ((fiveHourUsedPct ?? 0) >= 50 || weeklyUsedPct >= 40) {
    recommended = 'max5x'
  } else {
    recommended = 'pro'
  }

  const two5xWins = weeklyBound
  const two5xVs20x = {
    two5xWins,
    reason: two5xWins
      ? 'The weekly cap is the wall. Two Max 5x accounts roughly double weekly pool; one 20x mostly buys a bigger 5-hour burst.'
      : 'The 5-hour window is tighter than weekly, so 20x\'s 5h multiplier is the lever — two 5x accounts would not help as much.',
  }

  return {
    recommended,
    weeklyBound,
    weeklyUsedPct,
    fiveHourUsedPct,
    weeklyCostUsd: input.weeklyCostUsd,
    two5xVs20x,
    estimatesAsOf: PLAN_ESTIMATES.asOf,
    caveats,
  }
}
