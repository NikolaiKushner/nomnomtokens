/**
 * Model price table.
 *
 * Prices are USD per million tokens, as published on platform.claude.com.
 * Modern Claude Code JSONL carries no `costUSD` field, so every cost figure in
 * nomnomtokens is computed here — which makes this table load-bearing and
 * therefore something we must be able to refresh without shipping a release.
 *
 * Strategy (see docs/architecture.md): this file is the bundled fallback. When
 * online, `nnt scan` can refresh `~/.nomnomtokens/prices.json` and that file
 * wins. Stale prices are a visible risk in the README, not a silent one.
 */

export interface ModelPrice {
  /** USD per 1M input tokens */
  input: number
  /** USD per 1M output tokens */
  output: number
  /**
   * Cache multipliers relative to `input`. The API charges 1.25x for a 5-minute
   * cache write, 2x for a 1-hour write, and 0.1x for a cache read.
   */
  cacheWrite5m?: number
  cacheWrite1h?: number
  cacheRead?: number
}

export const DEFAULT_CACHE_MULTIPLIERS = {
  write5m: 1.25,
  write1h: 2,
  read: 0.1,
} as const

/** Keyed by canonical model id. Aliases are resolved in `resolveModelKey`. */
export const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-mythos-5': { input: 10, output: 50 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-opus-4-1': { input: 15, output: 75 },
  'claude-opus-4-0': { input: 15, output: 75 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-sonnet-4-0': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-3-5-haiku': { input: 0.8, output: 4 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },

  // Cursor / Codex-routed OpenAI ids (public list prices where known; Composer is unpriced).
  // Dotted and dashed forms: resolveModelKey normalises `.` → `-`.
  'gpt-5.6': { input: 1.75, output: 14 },
  'gpt-5-6': { input: 1.75, output: 14 },
  'gpt-5.6-terra': { input: 1.75, output: 14 },
  'gpt-5-6-terra': { input: 1.75, output: 14 },
  'gpt-5.6-luna': { input: 1.75, output: 14 },
  'gpt-5-6-luna': { input: 1.75, output: 14 },
  'gpt-5.5': { input: 1.25, output: 10 },
  'gpt-5-5': { input: 1.25, output: 10 },
  'gpt-5.4-mini': { input: 0.25, output: 2 },
  'gpt-5-4-mini': { input: 0.25, output: 2 },
  'gpt-5.2': { input: 1.75, output: 14 },
  'gpt-5-2': { input: 1.75, output: 14 },
  'gpt-5.2-codex': { input: 1.75, output: 14 },
  'gpt-5-2-codex': { input: 1.75, output: 14 },
  'gpt-5': { input: 1.25, output: 10 },
  'gpt-4.1': { input: 2, output: 8 },
  'gpt-4-1': { input: 2, output: 8 },
  'gemini-3-flash': { input: 0.5, output: 3 },
  'gemini-2.5-pro': { input: 1.25, output: 10 },
  'gemini-2-5-pro': { input: 1.25, output: 10 },
  'grok-4.5': { input: 3, output: 15 },
  'grok-4-5': { input: 3, output: 15 },
  'grok-code-fast-1': { input: 0.2, output: 1.5 },
}

/**
 * Claude Code writes ids like `claude-haiku-4-5-20251001` or `<synthetic>`.
 * Strip trailing date snapshots and fast-mode suffixes, then match longest-prefix.
 */
/** `<synthetic>` and friends: client-generated messages that never hit the API. */
export function isSynthetic(model: string | null | undefined): boolean {
  return typeof model === 'string' && model.trim().startsWith('<')
}

/**
 * Cursor writes Anthropic ids as `claude-4.5-sonnet-thinking` rather than
 * `claude-sonnet-4-5`. Flip the family/version order when we recognise the
 * pattern so the existing Claude price rows still match.
 */
function normalizeCursorClaudeId(id: string): string {
  const m = id.match(/^claude-(\d+(?:-\d+)*)-(sonnet|opus|haiku)(?:-.*)?$/)
  if (!m) return id
  return `claude-${m[2]}-${m[1]}`
}

export function resolveModelKey(model: string | null | undefined): string | null {
  if (!model) return null
  const id = model.trim().toLowerCase()
  if (!id || isSynthetic(id)) return null

  // Cursor's `default` / proprietary Composer models have no public token price.
  // Also collapse repeated Auto placeholders: `default,default,default,default`.
  if (
    id === 'default'
    || id.startsWith('composer-')
    || id.split(',').every(p => p.trim() === 'default')
  ) {
    return null
  }

  const normalized = normalizeCursorClaudeId(
    id
      .replace(/^anthropic\./, '')
      .replace(/\./g, '-')
      .replace(/-thinking$/, '')
      .replace(/-high-thinking$/, '')
      .replace(/-high$/, '')
      .replace(/-\d{8}$/, '')
      .replace(/-fast$/, '')
      .replace(/\[1m\]$/, ''),
  )

  if (PRICES[normalized]) return normalized

  // longest-prefix match handles ids we haven't catalogued yet but that share a family
  let best: string | null = null
  for (const key of Object.keys(PRICES)) {
    if (normalized.startsWith(key) && (best === null || key.length > best.length)) best = key
  }
  return best
}

export interface PriceTable {
  get(model: string | null | undefined): ModelPrice | null
}

export function makePriceTable(overrides: Record<string, ModelPrice> = {}): PriceTable {
  const table = { ...PRICES, ...overrides }
  return {
    get(model) {
      const key = resolveModelKey(model)
      if (!key) return null
      return table[key] ?? null
    },
  }
}

export const defaultPrices = makePriceTable()

/**
 * Cost in USD for one token-kind event. Returns null for models we cannot
 * price — showing "unknown" beats quietly reporting $0.
 */
export function costOf(
  model: string | null | undefined,
  qty: Record<string, number>,
  prices: PriceTable = defaultPrices,
): number | null {
  // `<synthetic>` marks a message the client generated locally — an interrupt
  // notice, an error placeholder. No API call happened, so it costs exactly
  // zero. That is different from "we don't know the price", and conflating the
  // two makes `nnt doctor` report a problem that isn't one.
  if (isSynthetic(model)) return 0

  const p = prices.get(model)
  if (!p) return null

  const m = DEFAULT_CACHE_MULTIPLIERS
  const perToken = p.input / 1_000_000
  const outPerToken = p.output / 1_000_000

  return (
    (qty.in ?? 0) * perToken
    + (qty.out ?? 0) * outPerToken
    + (qty.cacheCreate ?? 0) * perToken * (p.cacheWrite5m ?? m.write5m)
    + (qty.cacheCreate1h ?? 0) * perToken * (p.cacheWrite1h ?? m.write1h)
    + (qty.cacheRead ?? 0) * perToken * (p.cacheRead ?? m.read)
  )
}
