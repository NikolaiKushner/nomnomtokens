/**
 * Serialize export rows to CSV / JSON. Kept in core so the CLI and the
 * dashboard HTTP handler share one shape and one escaping rule.
 */

import type { IngestRecord, LimitSnapshot, SpendEvent } from './types.js'
import { totalTokens } from './types.js'

export interface ExportableRow {
  id: string
  ts: number
  provider: string
  kind: string
  sessionId: string | null
  scopeHash: string
  project: string | null
  client: string | null
  model: string | null
  costUsd: number | null
  tokens: number
  qtyIn: number
  qtyOut: number
  qtyCacheCreate: number
  qtyCacheCreate1h: number
  qtyCacheRead: number
}

const CSV_HEADERS = [
  'timestamp',
  'provider',
  'kind',
  'session_id',
  'project',
  'client',
  'scope_hash',
  'model',
  'cost_usd',
  'tokens',
  'input_tokens',
  'output_tokens',
  'cache_create',
  'cache_create_1h',
  'cache_read',
] as const

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function formatExportCsv(rows: ExportableRow[]): string {
  const lines = [CSV_HEADERS.join(',')]
  for (const r of rows) {
    lines.push([
      csvCell(new Date(r.ts).toISOString()),
      csvCell(r.provider),
      csvCell(r.kind),
      csvCell(r.sessionId),
      csvCell(r.project),
      csvCell(r.client),
      csvCell(r.scopeHash),
      csvCell(r.model),
      csvCell(r.costUsd),
      csvCell(r.tokens),
      csvCell(r.qtyIn),
      csvCell(r.qtyOut),
      csvCell(r.qtyCacheCreate),
      csvCell(r.qtyCacheCreate1h),
      csvCell(r.qtyCacheRead),
    ].join(','))
  }
  return `${lines.join('\n')}\n`
}

export function formatExportJson(rows: ExportableRow[]): string {
  return `${JSON.stringify(rows.map(r => ({
    timestamp: new Date(r.ts).toISOString(),
    ts: r.ts,
    provider: r.provider,
    kind: r.kind,
    sessionId: r.sessionId,
    project: r.project,
    client: r.client,
    scopeHash: r.scopeHash,
    model: r.model,
    costUsd: r.costUsd,
    tokens: r.tokens,
    inputTokens: r.qtyIn,
    outputTokens: r.qtyOut,
    cacheCreate: r.qtyCacheCreate,
    cacheCreate1h: r.qtyCacheCreate1h,
    cacheRead: r.qtyCacheRead,
  })), null, 2)}\n`
}

/** Portable store dump — events + limits + local scope labels. Not scan_state. */
export const NNT_ARCHIVE_VERSION = 1

export interface NntScope {
  scopeHash: string
  label: string
  provider: string
  lastSeen: number
  client: string | null
  labelLocked: boolean
}

export interface NntArchive {
  version: number
  events: SpendEvent[]
  limits: LimitSnapshot[]
  scopes: NntScope[]
}

export function formatNntArchive(archive: NntArchive): string {
  return `${JSON.stringify({ ...archive, version: NNT_ARCHIVE_VERSION }, null, 2)}\n`
}

function numbersOnly(meta: unknown): Record<string, number> {
  if (!meta || typeof meta !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

function qtyOnly(qty: unknown): Record<string, number> {
  if (!qty || typeof qty !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(qty as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
  }
  return out
}

/** True when the text looks like an nnt store dump rather than a billing CSV. */
export function looksLikeNntArchive(text: string): boolean {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith('{')) return false
  try {
    const parsed = JSON.parse(text) as { version?: unknown, events?: unknown }
    return parsed.version === NNT_ARCHIVE_VERSION && Array.isArray(parsed.events)
  } catch {
    return false
  }
}

export function parseNntArchive(text: string): IngestRecord[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('nnt archive is not valid JSON')
  }
  const data = parsed as Partial<NntArchive>
  if (data.version !== NNT_ARCHIVE_VERSION || !Array.isArray(data.events)) {
    throw new Error('not an nnt archive (expected { version: 1, events })')
  }

  const records: IngestRecord[] = []
  for (const raw of data.events) {
    if (!raw || typeof raw.id !== 'string') continue
    const qty = qtyOnly(raw.qty)
    const event: SpendEvent = {
      id: raw.id,
      ts: typeof raw.ts === 'number' ? raw.ts : 0,
      provider: typeof raw.provider === 'string' ? raw.provider : 'nnt',
      kind: typeof raw.kind === 'string' ? raw.kind : 'tokens',
      sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
      scopeHash: typeof raw.scopeHash === 'string' ? raw.scopeHash : 'unknown',
      unitLabel: typeof raw.unitLabel === 'string' ? raw.unitLabel : null,
      qty,
      costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : null,
      meta: numbersOnly(raw.meta),
    }
    if (!Number.isFinite(event.ts) || event.ts <= 0) continue
    void totalTokens(qty)
    records.push({ type: 'event', event })
  }

  for (const raw of data.limits ?? []) {
    if (!raw || typeof raw.ts !== 'number' || typeof raw.provider !== 'string') continue
    records.push({
      type: 'limit',
      limit: {
        ts: raw.ts,
        provider: raw.provider,
        window: typeof raw.window === 'string' ? raw.window : '7d',
        usedPct: typeof raw.usedPct === 'number' ? raw.usedPct : 0,
        resetsAt: typeof raw.resetsAt === 'number' ? raw.resetsAt : null,
      },
    })
  }

  for (const raw of data.scopes ?? []) {
    if (!raw || typeof raw.scopeHash !== 'string' || typeof raw.label !== 'string') continue
    records.push({
      type: 'scope',
      scopeHash: raw.scopeHash,
      label: raw.label,
      provider: typeof raw.provider === 'string' ? raw.provider : 'nnt',
      lastSeen: typeof raw.lastSeen === 'number' ? raw.lastSeen : undefined,
      client: typeof raw.client === 'string' ? raw.client : null,
      labelLocked: Boolean(raw.labelLocked),
    })
  }

  return records
}
