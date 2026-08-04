import type { IngestRecord, LimitSnapshot, SpendEvent } from '@nomnomtokens/core'
import { scopeHash, scopeLabel } from '@nomnomtokens/core'

/**
 * Parser for the statusLine hook payload (stdin JSON).
 *
 * This is the *live* half of the claude-code adapter. JSONL is the history and
 * is only written when a turn completes; the statusline fires on every render,
 * which is what makes the dashboard move in real time.
 *
 * It is also the only source of subscription limits — `rate_limits.five_hour`
 * and `rate_limits.seven_day` exist nowhere in the transcript — and the only
 * source of authoritative per-session line counts.
 */

export interface StatuslinePayload {
  session_id?: string
  cwd?: string
  workspace?: { current_dir?: string, project_dir?: string }
  model?: { id?: string, display_name?: string }
  version?: string
  cost?: {
    total_cost_usd?: number
    total_duration_ms?: number
    total_api_duration_ms?: number
    total_lines_added?: number
    total_lines_removed?: number
  }
  context_window?: {
    total_input_tokens?: number
    total_output_tokens?: number
    context_window_size?: number
    used_percentage?: number
  }
  rate_limits?: {
    five_hour?: RawRateLimit
    seven_day?: RawRateLimit
  }
}

interface RawRateLimit {
  used_percentage?: number
  /** unix SECONDS, not ms */
  resets_at?: number
}

const WINDOWS: Array<[keyof NonNullable<StatuslinePayload['rate_limits']>, string]> = [
  ['five_hour', '5h'],
  ['seven_day', '7d'],
]

export function parseLimits(payload: StatuslinePayload, now = Date.now()): LimitSnapshot[] {
  const out: LimitSnapshot[] = []
  for (const [key, window] of WINDOWS) {
    const raw = payload.rate_limits?.[key]
    if (!raw || typeof raw.used_percentage !== 'number') continue
    out.push({
      ts: now,
      provider: 'claude-code',
      window,
      usedPct: raw.used_percentage,
      // the payload uses unix seconds; everything downstream is unix ms
      resetsAt: typeof raw.resets_at === 'number' ? raw.resets_at * 1000 : null,
    })
  }
  return out
}

/**
 * Session-level rollup as a spend event.
 *
 * `kind: 'session'` rather than `'tokens'` and a stable id per session, so
 * repeated statusline fires upsert one row instead of accumulating thousands.
 * It never double-counts against the JSONL token events because the UI only
 * ever sums within a single `kind`.
 */
export async function parseSessionRollup(
  payload: StatuslinePayload,
  now = Date.now(),
): Promise<SpendEvent | null> {
  const sessionId = payload.session_id
  if (!sessionId) return null

  const dir = payload.workspace?.project_dir ?? payload.workspace?.current_dir ?? payload.cwd
  const cost = payload.cost ?? {}

  const meta: Record<string, number> = {
    linesAdded: cost.total_lines_added ?? 0,
    linesRemoved: cost.total_lines_removed ?? 0,
    durationMs: cost.total_duration_ms ?? 0,
    apiDurationMs: cost.total_api_duration_ms ?? 0,
  }
  if (typeof payload.context_window?.used_percentage === 'number') {
    meta.contextUsedPct = payload.context_window.used_percentage
  }

  return {
    id: `claude-code:session:${sessionId}`,
    ts: now,
    provider: 'claude-code',
    kind: 'session',
    sessionId,
    scopeHash: dir ? await scopeHash(dir) : 'unknown',
    unitLabel: payload.model?.id ?? null,
    qty: {
      sessions: 1,
      linesChanged: (cost.total_lines_added ?? 0) + (cost.total_lines_removed ?? 0),
    },
    // Claude Code's own figure for the session. We keep it as reported rather
    // than recomputing: when it disagrees with our JSONL sum, that disagreement
    // is information (see docs/architecture.md, "Which number to trust").
    costUsd: typeof cost.total_cost_usd === 'number' ? cost.total_cost_usd : null,
    meta,
  }
}

/** Everything a single statusline fire contributes to the store. */
export async function parseStatusline(
  payload: StatuslinePayload,
  now = Date.now(),
): Promise<IngestRecord[]> {
  const records: IngestRecord[] = []

  const dir = payload.workspace?.project_dir ?? payload.workspace?.current_dir ?? payload.cwd
  if (dir) {
    records.push({
      type: 'scope',
      scopeHash: await scopeHash(dir),
      label: scopeLabel(dir),
      provider: 'claude-code',
    })
  }

  const rollup = await parseSessionRollup(payload, now)
  if (rollup) records.push({ type: 'event', event: rollup })

  for (const limit of parseLimits(payload, now)) records.push({ type: 'limit', limit })

  return records
}
