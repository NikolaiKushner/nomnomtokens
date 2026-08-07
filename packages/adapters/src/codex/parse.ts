import type { IngestRecord, LimitSnapshot, PriceTable, SpendEvent } from '@nomnomtokens/core'
import { costOf, defaultPrices, scopeHash } from '@nomnomtokens/core'

/**
 * Parser for Codex CLI / IDE rollout JSONL under `~/.codex/sessions/**`.
 *
 * The format is not a public contract. We keep only:
 *   - `session_meta` → session id + cwd (for hashing)
 *   - `turn_context` → current model id
 *   - `event_msg` / `token_count` → per-turn `last_token_usage` + rate limits
 *
 * Message text, tool inputs, diffs, and git metadata are ignored.
 *
 * `last_token_usage` is the turn delta; `total_token_usage` is cumulative and
 * becomes the stable half of the dedup key so re-scans upsert cleanly.
 */

interface RawLine {
  timestamp?: string
  type?: string
  payload?: RawPayload
}

interface RawPayload {
  type?: string
  session_id?: string
  id?: string
  cwd?: string
  model?: string
  turn_id?: string
  info?: {
    total_token_usage?: RawUsage
    last_token_usage?: RawUsage
  }
  rate_limits?: RawRateLimits
}

interface RawUsage {
  input_tokens?: number
  cached_input_tokens?: number
  cache_write_input_tokens?: number
  output_tokens?: number
  reasoning_output_tokens?: number
  total_tokens?: number
}

interface RawRateWindow {
  used_percent?: number
  window_minutes?: number
  resets_at?: number
}

interface RawRateLimits {
  primary?: RawRateWindow | null
  secondary?: RawRateWindow | null
}

export interface CodexParserOptions {
  prices?: PriceTable
  provider?: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Map Codex window lengths onto the short labels the Limits screen already uses. */
export function windowLabel(minutes: number | undefined): string | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) return null
  if (minutes === 300) return '5h'
  if (minutes === 10080) return '7d'
  if (minutes === 43200) return '30d'
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`
  if (minutes % 60 === 0) return `${minutes / 60}h`
  return `${minutes}m`
}

export function labelFromCwd(cwd: string | null | undefined): string {
  if (!cwd) return 'unknown'
  const parts = cwd.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? 'unknown'
}

function qtyFromUsage(usage: RawUsage): {
  in: number
  out: number
  cacheCreate: number
  cacheCreate1h: number
  cacheRead: number
} {
  const input = num(usage.input_tokens)
  const cached = num(usage.cached_input_tokens)
  // Codex reports cached as a subset of input; split so totals don't double-count
  // and so cache reads get the cheaper multiplier in `costOf`.
  return {
    in: Math.max(0, input - cached),
    out: num(usage.output_tokens),
    cacheCreate: num(usage.cache_write_input_tokens),
    cacheCreate1h: 0,
    cacheRead: cached,
  }
}

function parseLimits(
  rate: RawRateLimits | undefined,
  provider: string,
  ts: number,
): LimitSnapshot[] {
  if (!rate) return []
  const out: LimitSnapshot[] = []
  for (const key of ['primary', 'secondary'] as const) {
    const win = rate[key]
    if (!win || typeof win.used_percent !== 'number') continue
    const window = windowLabel(win.window_minutes) ?? key
    out.push({
      ts,
      provider,
      window,
      usedPct: win.used_percent,
      resetsAt: typeof win.resets_at === 'number' && Number.isFinite(win.resets_at)
        ? win.resets_at * 1000
        : null,
    })
  }
  return out
}

/**
 * Stateful across lines of one rollout file: session id / cwd / model arrive
 * before the token_count rows that need them.
 */
export class CodexRolloutParser {
  private readonly prices: PriceTable
  private readonly provider: string
  private sessionId: string | null = null
  private cwd: string | null = null
  private model: string | null = null
  /** Last emitted limit per window — Codex repeats the same % on every token_count. */
  private lastLimits = new Map<string, { usedPct: number, resetsAt: number | null }>()

  constructor(opts: CodexParserOptions = {}) {
    this.prices = opts.prices ?? defaultPrices
    this.provider = opts.provider ?? 'codex'
  }

  reset(): void {
    this.sessionId = null
    this.cwd = null
    this.model = null
    this.lastLimits.clear()
  }

  /** Last path segment of the session cwd — safe to show as a project label. */
  scopeLabel(): string {
    return labelFromCwd(this.cwd)
  }

  /** @returns zero or more ingest records for this line. */
  async parseLine(line: string): Promise<IngestRecord[]> {
    const trimmed = line.trim()
    if (!trimmed) return []

    let raw: RawLine
    try {
      raw = JSON.parse(trimmed) as RawLine
    } catch {
      return []
    }

    const payload = raw.payload
    if (!payload) return []

    if (raw.type === 'session_meta') {
      this.sessionId = payload.session_id ?? payload.id ?? this.sessionId
      if (typeof payload.cwd === 'string' && payload.cwd) this.cwd = payload.cwd
      return []
    }

    if (raw.type === 'turn_context') {
      if (typeof payload.model === 'string' && payload.model) this.model = payload.model
      if (typeof payload.cwd === 'string' && payload.cwd) this.cwd = payload.cwd
      return []
    }

    if (raw.type !== 'event_msg' || payload.type !== 'token_count') return []

    const ts = raw.timestamp ? Date.parse(raw.timestamp) : Number.NaN
    if (!Number.isFinite(ts)) return []

    const records: IngestRecord[] = []
    for (const limit of parseLimits(payload.rate_limits, this.provider, ts)) {
      // Skip unchanged snapshots — otherwise dozens of identical rows in one
      // session invent a nonsense burn rate (hundreds of %/h).
      const prev = this.lastLimits.get(limit.window)
      if (
        prev
        && prev.usedPct === limit.usedPct
        && prev.resetsAt === limit.resetsAt
      ) {
        continue
      }
      this.lastLimits.set(limit.window, { usedPct: limit.usedPct, resetsAt: limit.resetsAt })
      records.push({ type: 'limit', limit })
    }

    const last = payload.info?.last_token_usage
    const total = payload.info?.total_token_usage
    if (!last) return records

    const qty = qtyFromUsage(last)
    if (qty.in + qty.out + qty.cacheCreate + qty.cacheRead === 0) return records

    const sessionId = this.sessionId
    const totalIn = num(total?.input_tokens)
    const totalOut = num(total?.output_tokens)
    // Cumulative totals uniquely identify the row inside a session; timestamps
    // alone can collide when several tool calls land in the same millisecond.
    const id = `${this.provider}:${sessionId ?? 'nosession'}:${totalIn}:${totalOut}`

    const hash = this.cwd ? await scopeHash(this.cwd) : 'unknown'
    const event: SpendEvent = {
      id,
      ts,
      provider: this.provider,
      kind: 'tokens',
      sessionId,
      scopeHash: hash,
      unitLabel: this.model,
      qty,
      costUsd: costOf(this.model, qty, this.prices),
      meta: {
        reasoningOutputTokens: num(last.reasoning_output_tokens),
      },
    }
    records.push({ type: 'event', event })
    return records
  }
}
