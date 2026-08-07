/**
 * Serialize export rows to CSV / JSON. Kept in core so the CLI and the
 * dashboard HTTP handler share one shape and one escaping rule.
 */

export interface ExportableRow {
  id: string
  ts: number
  provider: string
  kind: string
  sessionId: string | null
  scopeHash: string
  project: string | null
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
