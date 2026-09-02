/**
 * Infer "cold resume" turns from an already-stored session timeline.
 *
 * A resume after the prompt-cache TTL is the quota killer: a large cache
 * write following an idle gap, not a high cache-hit rate (hits are cheap).
 * Cursor/Codex events typically have no cacheCreate — those sessions yield
 * an empty list, never a fake 0%.
 */

export const COLD_GAP_MS = 60 * 60 * 1000
/** Skip tiny prefix writes that look like a normal first-turn cache seed. */
export const MIN_CACHE_WRITE = 2_000

export interface SessionTurn {
  ts: number
  costUsd: number | null
  qty: Record<string, number>
}

export interface ColdResume {
  sessionId: string
  label: string | null
  /** unix ms of the expensive post-gap turn */
  ts: number
  gapMs: number
  costUsd: number
  cacheWriteTokens: number
}

export function cacheWriteTokens(qty: Record<string, number>): number {
  return (qty.cacheCreate ?? 0) + (qty.cacheCreate1h ?? 0)
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!
}

/**
 * Find turns that look like a cache rebuild after the session went idle.
 *
 * A hit is: gap from the previous turn ≥ 1h, and a cache write that is
 * either the majority of that turn's input-like tokens or well above the
 * session's median write.
 */
export function detectColdResumes(
  sessionId: string,
  label: string | null,
  turns: SessionTurn[],
): ColdResume[] {
  if (turns.length < 2) return []

  const sorted = [...turns].sort((a, b) => a.ts - b.ts)
  const writes = sorted.map(t => cacheWriteTokens(t.qty))
  if (!writes.some(w => w > 0)) return []

  const medianWrite = median(writes.filter(w => w > 0))
  const out: ColdResume[] = []

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!
    const cur = sorted[i]!
    const gapMs = cur.ts - prev.ts
    if (gapMs < COLD_GAP_MS) continue

    const write = cacheWriteTokens(cur.qty)
    if (write < MIN_CACHE_WRITE) continue

    const inputish = write + (cur.qty.in ?? 0) + (cur.qty.cacheRead ?? 0)
    const writeShare = inputish > 0 ? write / inputish : 0
    const aboveMedian = medianWrite > 0 ? write > medianWrite * 1.5 : true
    if (!aboveMedian && writeShare < 0.5) continue

    out.push({
      sessionId,
      label,
      ts: cur.ts,
      gapMs,
      costUsd: cur.costUsd ?? 0,
      cacheWriteTokens: write,
    })
  }

  return out
}

/** Flatten per-session detections and keep the costliest few. */
export function collectColdResumes(
  sessions: Array<{
    sessionId: string
    label: string | null
    turns: SessionTurn[]
  }>,
  limit = 5,
): ColdResume[] {
  return sessions
    .flatMap(s => detectColdResumes(s.sessionId, s.label, s.turns))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, limit)
}
