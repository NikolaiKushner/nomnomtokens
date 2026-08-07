import type { PriceTable, SpendEvent } from '@nomnomtokens/core'
import { costOf, defaultPrices, EMPTY_TOKEN_QTY } from '@nomnomtokens/core'

/** Fields we read from a Cursor bubble. Everything else is ignored on purpose. */
export interface CursorBubble {
  bubbleId: string
  composerId: string
  /** 1 = user, 2 = assistant — Cursor's internal enum, not a contract. */
  type?: number
  createdAt?: string | number
  tokenCount?: {
    inputTokens?: number
    outputTokens?: number
  }
  contextWindowStatusAtCreation?: {
    tokensUsed?: number
    tokenLimit?: number
  }
}

export interface CursorComposerInfo {
  composerId: string
  model: string | null
  linesAdded: number
  linesRemoved: number
}

export interface ParseOptions {
  prices?: PriceTable
  provider?: string
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

function parseTs(raw: string | number | undefined): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Cursor sometimes stores ms epochs, sometimes seconds-looking values that
    // are already ms (createdAt in headers is ms). ISO strings are preferred.
    return raw < 1e12 ? raw * 1000 : raw
  }
  if (typeof raw === 'string' && raw.length > 0) {
    const ms = Date.parse(raw)
    return Number.isFinite(ms) ? ms : null
  }
  return null
}

function hasExactTokens(b: CursorBubble): boolean {
  const tc = b.tokenCount
  return num(tc?.inputTokens) > 0 || num(tc?.outputTokens) > 0
}

function tokensUsedOf(b: CursorBubble): number {
  return num(b.contextWindowStatusAtCreation?.tokensUsed)
}

/**
 * Turn a composer's bubbles into spend events.
 *
 * Cursor's local DB is incomplete: most bubbles store `tokenCount: {0,0}`.
 * When exact counts exist we use them. Otherwise we fall back to
 * `contextWindowStatusAtCreation.tokensUsed` (input) and the growth between
 * consecutive `tokensUsed` values as an approximate output — the same delta
 * method other local Cursor trackers use. We never estimate from message text.
 *
 * To avoid double-counting a turn that has both signals on different bubbles,
 * a composer that has any exact `tokenCount` emits only those; otherwise it
 * uses the tokensUsed path.
 */
export function eventsFromComposer(
  composer: CursorComposerInfo,
  bubbles: CursorBubble[],
  scopeHash: string,
  opts: ParseOptions = {},
): SpendEvent[] {
  const prices = opts.prices ?? defaultPrices
  const provider = opts.provider ?? 'cursor'
  const model = composer.model

  const sorted = [...bubbles].sort((a, b) => {
    const ta = parseTs(a.createdAt) ?? 0
    const tb = parseTs(b.createdAt) ?? 0
    return ta - tb
  })

  const useExact = sorted.some(hasExactTokens)
  const events: SpendEvent[] = []
  let linesAttached = false

  const attachLines = (): Record<string, number> => {
    if (linesAttached) return { linesAdded: 0, linesRemoved: 0 }
    linesAttached = true
    return {
      linesAdded: composer.linesAdded,
      linesRemoved: composer.linesRemoved,
    }
  }

  if (useExact) {
    for (const b of sorted) {
      if (!hasExactTokens(b)) continue
      const ts = parseTs(b.createdAt)
      if (ts === null) continue

      const qty = {
        ...EMPTY_TOKEN_QTY,
        in: num(b.tokenCount?.inputTokens),
        out: num(b.tokenCount?.outputTokens),
      }
      events.push({
        id: `${provider}:${b.composerId}:${b.bubbleId}`,
        ts,
        provider,
        kind: 'tokens',
        sessionId: composer.composerId,
        scopeHash,
        unitLabel: model,
        qty,
        costUsd: costOf(model, qty, prices),
        meta: attachLines(),
      })
    }
    return events
  }

  // tokensUsed fallback — only bubbles that actually recorded a context size
  const withUsed = sorted.filter(b => tokensUsedOf(b) > 0)
  for (let i = 0; i < withUsed.length; i++) {
    const b = withUsed[i]!
    const ts = parseTs(b.createdAt)
    if (ts === null) continue

    const used = tokensUsedOf(b)
    const next = withUsed[i + 1]
    const nextUsed = next ? tokensUsedOf(next) : 0
    const out = nextUsed > used ? nextUsed - used : 0

    const qty = {
      ...EMPTY_TOKEN_QTY,
      in: used,
      out,
    }

    events.push({
      id: `${provider}:${b.composerId}:${b.bubbleId}`,
      ts,
      provider,
      kind: 'tokens',
      sessionId: composer.composerId,
      scopeHash,
      unitLabel: model,
      qty,
      costUsd: costOf(model, qty, prices),
      meta: attachLines(),
    })
  }

  return events
}
