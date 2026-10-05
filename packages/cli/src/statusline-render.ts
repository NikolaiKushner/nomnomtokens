import { untilReset } from './format.js'

const CLAUDE_WEEKLY_HINT = 80
const CODEX_HEADROOM = 50
const ESC = '\u001b'

export interface StatuslineView {
  fiveHour: number | null
  sevenDay: number | null
  fiveHourResetsAt?: number
  sevenDayResetsAt?: number
  ctx: number | null
  /** Claude's display name for the session model, or its id */
  model?: string | null
  /** latest Codex 7d used% from the local store, if fresh */
  codexSevenDay?: number | null
  now?: number
}

/** Label colour. The hook's stdout is a pipe, so this ignores isTTY and only honours NO_COLOR. */
function paintLabel(label: string): string {
  if (process.env.NO_COLOR !== undefined) return label
  return `${ESC}[36m${label}${ESC}[0m`
}

export function limitSegment(
  label: string,
  usedPct: number,
  resetsAtSeconds?: number,
  now?: number,
): string {
  const resetsAt = typeof resetsAtSeconds === 'number' && Number.isFinite(resetsAtSeconds)
    ? resetsAtSeconds * 1000
    : null
  const left = untilReset(resetsAt, now)
  const head = `${paintLabel(label)}  ${Math.round(usedPct)}%`
  return left ? `${head}  ${left}` : head
}

export interface CachedWindow {
  usedPct: number
  /** unix ms, as stored */
  resetsAt: number | null
}

/**
 * Live payload wins. A missing window falls back to the last stored snapshot
 * only while that window has not reset — used% only climbs until then, so the
 * cached figure is a lower bound, not a guess about a new cycle.
 */
export function resolveWindow(
  livePct: number | null,
  liveResetsAtSeconds: number | undefined,
  cached: CachedWindow | null,
  now: number,
): { pct: number | null, resetsAtSeconds?: number } {
  if (livePct !== null) {
    return { pct: livePct, resetsAtSeconds: liveResetsAtSeconds }
  }
  if (cached && cached.resetsAt !== null && cached.resetsAt > now) {
    return { pct: cached.usedPct, resetsAtSeconds: cached.resetsAt / 1000 }
  }
  return { pct: null }
}

/**
 * One status line: `Limits: 7d  81%  4d3h  |  5h  73%  1h47m  |  ctx. 37%  |  Opus 4.6`.
 * Windows stay in that order. The session model, when Claude sent one, is the
 * last ordinary segment. Codex headroom follows it and never replaces it.
 */
export function buildStatuslineParts(view: StatuslineView): string {
  const now = view.now
  const five = view.fiveHour
  const seven = view.sevenDay
  const segments: string[] = []

  if (seven !== null) segments.push(limitSegment('7d', seven, view.sevenDayResetsAt, now))
  if (five !== null) segments.push(limitSegment('5h', five, view.fiveHourResetsAt, now))
  if (view.ctx !== null) segments.push(`${paintLabel('ctx')}. ${Math.round(view.ctx)}%`)
  const model = view.model?.trim()
  if (model) segments.push(paintLabel(model))

  const codex = view.codexSevenDay
  if (
    seven !== null
    && seven >= CLAUDE_WEEKLY_HINT
    && typeof codex === 'number'
    && Number.isFinite(codex)
    && codex <= CODEX_HEADROOM
  ) {
    segments.push(`${paintLabel('codex')}: ${Math.round(codex)}%`)
  }

  return segments.length === 0 ? 'Limits:' : `Limits: ${segments.join('  |  ')}`
}
