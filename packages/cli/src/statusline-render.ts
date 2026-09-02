import { moodFor } from '@nomnomtokens/core'
import { compactNumber, untilReset, usd } from './format.js'

export const MOOD_FACE: Record<string, string> = {
  hungry: '(・_・)',
  content: '(^_^)',
  full: '(＾ｕ＾)',
  stuffed: '(>_<)',
  overstuffed: '(x_x)',
}

const CLAUDE_WEEKLY_HINT = 80
const CODEX_HEADROOM = 50

export interface StatuslineView {
  fiveHour: number | null
  sevenDay: number | null
  fiveHourResetsAt?: number
  sevenDayResetsAt?: number
  cost: number | null
  ctx: number | null
  lines: number
  /** latest Codex 7d used% from the local store, if fresh */
  codexSevenDay?: number | null
  now?: number
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
  return `${label} ${Math.round(usedPct)}%${left ? ` ·${left}` : ''}`
}

/**
 * Assemble statusline segments. Weekly-first when 7d used% >= 5h.
 * Codex headroom is a suffix, never a substitute for the Claude payload.
 */
export function buildStatuslineParts(view: StatuslineView): string[] {
  const now = view.now
  const five = view.fiveHour
  const seven = view.sevenDay
  const moodPct = Math.max(five ?? 0, seven ?? 0)

  const parts: string[] = []
  parts.push(MOOD_FACE[moodFor(moodPct)] ?? '(^_^)')
  if (view.cost !== null) parts.push(usd(view.cost))
  if (view.ctx !== null) parts.push(`ctx ${Math.round(view.ctx)}%`)

  const fiveSeg = five !== null
    ? limitSegment('5h', five, view.fiveHourResetsAt, now)
    : null
  const sevenSeg = seven !== null
    ? limitSegment('7d', seven, view.sevenDayResetsAt, now)
    : null

  const weeklyFirst = seven !== null && (five === null || seven >= five)
  if (weeklyFirst) {
    if (sevenSeg) parts.push(sevenSeg)
    if (fiveSeg) parts.push(fiveSeg)
  } else {
    if (fiveSeg) parts.push(fiveSeg)
    if (sevenSeg) parts.push(sevenSeg)
  }

  if (view.lines > 0) parts.push(`${compactNumber(view.lines)} lines`)

  const codex = view.codexSevenDay
  if (
    seven !== null
    && seven >= CLAUDE_WEEKLY_HINT
    && typeof codex === 'number'
    && Number.isFinite(codex)
    && codex <= CODEX_HEADROOM
  ) {
    parts.push(`codex 7d ${Math.round(codex)}%`)
  }

  return parts
}
