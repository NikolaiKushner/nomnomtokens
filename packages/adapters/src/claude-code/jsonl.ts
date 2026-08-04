import type { PriceTable, SpendEvent } from '@nomnomtokens/core'
import { costOf, defaultPrices, scopeHash } from '@nomnomtokens/core'

/**
 * Parser for `~/.claude/projects/**\/*.jsonl`.
 *
 * Written to be tolerant by construction: an unknown field is not an
 * exception, and a line that doesn't look like a priced assistant turn is
 * simply skipped. Claude Code's log format is not a public contract, so the
 * parser's job is to extract what it recognises and stay quiet about the rest.
 *
 * Two things this parser knows that a naive reader does not:
 *
 *  1. **The same turn is written more than once.** On a 25k-line corpus, 3,269
 *     of 4,806 distinct (requestId, message.id) pairs appeared 2-3 times in the
 *     *same* file, byte-identical apart from `uuid`. Summing without dedup
 *     over-reports by ~2.3x. The dedup key is therefore requestId + message.id,
 *     never `uuid`.
 *  2. **Modern logs carry no cost.** `costUSD` is absent from every record in
 *     current versions, so cost is computed from the model and the token
 *     counts (see packages/core/src/pricing.ts).
 */

/** Shape we care about. Everything is optional — the log is not a contract. */
interface RawLine {
  type?: string
  timestamp?: string
  sessionId?: string
  cwd?: string
  requestId?: string
  isSidechain?: boolean
  costUSD?: number
  message?: {
    id?: string
    model?: string
    usage?: RawUsage
  }
  toolUseResult?: {
    structuredPatch?: Array<{ lines?: string[] }>
  }
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  cache_creation?: {
    ephemeral_5m_input_tokens?: number
    ephemeral_1h_input_tokens?: number
  }
}

export interface JsonlParserOptions {
  prices?: PriceTable
  /** Overrides the provider name; used by tests and by the OTLP receiver. */
  provider?: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** Count +/- lines in a unified-diff hunk set. */
export function countPatchLines(patch: Array<{ lines?: string[] }> | undefined): {
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const hunk of patch ?? []) {
    for (const line of hunk.lines ?? []) {
      if (line.startsWith('+')) added += 1
      else if (line.startsWith('-')) removed += 1
    }
  }
  return { added, removed }
}

/**
 * Stateful because line attribution crosses records: an edit's diff arrives in
 * a later `user`/`toolUseResult` line than the assistant turn that requested
 * it. We accumulate pending line counts per session and attach them to the
 * next priced turn, so `SUM(meta.linesAdded)` over any filter is the number of
 * lines the agent changed while earning that spend.
 */
export class ClaudeCodeJsonlParser {
  private readonly prices: PriceTable
  private readonly provider: string
  private readonly pendingLines = new Map<string, { added: number, removed: number }>()

  constructor(opts: JsonlParserOptions = {}) {
    this.prices = opts.prices ?? defaultPrices
    this.provider = opts.provider ?? 'claude-code'
  }

  /** @returns the event, or null when the line carries no spend. */
  async parseLine(line: string): Promise<SpendEvent | null> {
    const trimmed = line.trim()
    if (trimmed.length === 0) return null

    let raw: RawLine
    try {
      raw = JSON.parse(trimmed) as RawLine
    } catch {
      return null // a torn write at the tail of a live file; the next scan gets it
    }

    // Diffs arrive on their own records — bank them for the next priced turn.
    if (raw.toolUseResult?.structuredPatch && raw.sessionId) {
      const { added, removed } = countPatchLines(raw.toolUseResult.structuredPatch)
      const pending = this.pendingLines.get(raw.sessionId) ?? { added: 0, removed: 0 }
      pending.added += added
      pending.removed += removed
      this.pendingLines.set(raw.sessionId, pending)
      return null
    }

    const usage = raw.message?.usage
    if (raw.type !== 'assistant' || !usage) return null

    const ts = raw.timestamp ? Date.parse(raw.timestamp) : Number.NaN
    if (!Number.isFinite(ts)) return null

    // cache_creation splits the total by TTL, and the two are priced
    // differently (1.25x vs 2x input). Fall back to the flat total when the
    // breakdown is missing, attributing it to the cheaper 5m bucket.
    const create5m = usage.cache_creation?.ephemeral_5m_input_tokens
    const create1h = num(usage.cache_creation?.ephemeral_1h_input_tokens)
    const createTotal = num(usage.cache_creation_input_tokens)

    const qty = {
      in: num(usage.input_tokens),
      out: num(usage.output_tokens),
      cacheCreate: create5m === undefined ? createTotal - create1h : num(create5m),
      cacheCreate1h: create1h,
      cacheRead: num(usage.cache_read_input_tokens),
    }

    const model = raw.message?.model ?? null
    const sessionId = raw.sessionId ?? null

    const lines = sessionId ? this.pendingLines.get(sessionId) : undefined
    if (sessionId) this.pendingLines.delete(sessionId)

    const meta: Record<string, number> = {
      linesAdded: lines?.added ?? 0,
      linesRemoved: lines?.removed ?? 0,
    }
    if (raw.isSidechain) meta.sidechain = 1

    return {
      // requestId+message.id, never uuid — see the class docblock
      id: `${this.provider}:${raw.requestId ?? 'norid'}:${raw.message?.id ?? ts}`,
      ts,
      provider: this.provider,
      kind: 'tokens',
      sessionId,
      scopeHash: raw.cwd ? await scopeHash(raw.cwd) : 'unknown',
      unitLabel: model,
      qty,
      // costUSD survives in archived logs from older versions; prefer it when present
      costUsd: typeof raw.costUSD === 'number' ? raw.costUSD : costOf(model, qty, this.prices),
      meta,
    }
  }

  /** Drop per-session accumulators; call between files to bound memory. */
  reset(): void {
    this.pendingLines.clear()
  }
}
