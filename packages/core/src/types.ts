/**
 * The two record types the core knows about. Everything else is an adapter's problem.
 *
 * Two hard rules, enforced by the types themselves:
 *   1. no free-form string fields carrying user content — no prompts, no code, no paths;
 *   2. `meta` holds numbers only, so no text can leak out through an adapter.
 */

/** A unit of spend. Not tied to AI: `kind` says what exactly was consumed. */
export interface SpendEvent {
  /** stable deduplication key: `${provider}:${requestId}:${messageId}`, hash of a CSV row, ... */
  id: string
  /** unix ms */
  ts: number
  /** which adapter produced the event: 'claude-code' | 'codex' | 'csv' | ... */
  provider: string
  /** what we're measuring: 'tokens' | 'requests' | 'minutes' | 'currency' | ... */
  kind: string
  sessionId: string | null
  /** sha256(project path).slice(0,16); the human-readable alias lives only in the local DB */
  scopeHash: string
  /** free-form detail: model, runner type, SKU — whatever is meaningful for the provider */
  unitLabel: string | null
  /** quantities in units of `kind`; for tokens — unpacked by type */
  qty: Record<string, number>
  costUsd: number | null
  /** numbers only, never strings */
  meta: Record<string, number>
}

/** A constraint snapshot (subscription limits, CI quotas, ...) */
export interface LimitSnapshot {
  ts: number
  provider: string
  /** '5h' | '7d' | 'month' | ... */
  window: string
  usedPct: number
  resetsAt: number | null
}

export type IngestRecord =
  | { type: 'event', event: SpendEvent }
  | { type: 'limit', limit: LimitSnapshot }
  | {
    type: 'scope'
    scopeHash: string
    label: string
    provider: string
    lastSeen?: number
    client?: string | null
    labelLocked?: boolean
  }

/** Where an incremental scan left off, per source file. */
export interface ScanCursor {
  sourcePath: string
  mtime: number
  size: number
  offset: number
}

export interface ScanState {
  get(sourcePath: string): ScanCursor | undefined
  set(cursor: ScanCursor): void
}

export interface Adapter {
  name: string
  /** is there anything to read on this machine (detection by presence of dirs/config) */
  detect(): Promise<boolean>
  /** passive collection: walk the sources from the last known position */
  scan(state: ScanState): AsyncIterable<IngestRecord>
  /** active collection: subscribe to changes (watcher, http receiver) */
  watch?(emit: (r: IngestRecord) => void): () => void
}

/** Token quantity keys used by every token-kind provider. */
export interface TokenQty extends Record<string, number> {
  in: number
  out: number
  cacheCreate: number
  cacheCreate1h: number
  cacheRead: number
}

export const EMPTY_TOKEN_QTY: TokenQty = {
  in: 0,
  out: 0,
  cacheCreate: 0,
  cacheCreate1h: 0,
  cacheRead: 0,
}

/** Total billable tokens for a token-kind event. */
export function totalTokens(qty: Record<string, number>): number {
  return (
    (qty.in ?? 0) + (qty.out ?? 0) + (qty.cacheCreate ?? 0)
    + (qty.cacheCreate1h ?? 0) + (qty.cacheRead ?? 0)
  )
}
