import type BetterSqlite3 from 'better-sqlite3'
import type { Granularity, LimitSnapshot } from '@nomnomtokens/core'

/**
 * The read layer. Aggregation runs in SQL rather than in JS: the dashboard has
 * to stay responsive over a year of history, and pulling 100k rows into the
 * Nitro process to sum them in a loop does not.
 */

export interface Filters {
  /** unix ms, inclusive */
  from?: number
  /** unix ms, exclusive */
  to?: number
  provider?: string[]
  scopeHash?: string[]
  sessionId?: string
  /** tokens don't add up with minutes — the UI always pins a kind before summing */
  kind?: string
}

interface Where { sql: string, params: Record<string, unknown> }

function buildWhere(f: Filters, prefix = 'e'): Where {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}

  if (f.from !== undefined) {
    clauses.push(`${prefix}.ts >= @from`)
    params.from = f.from
  }
  if (f.to !== undefined) {
    clauses.push(`${prefix}.ts < @to`)
    params.to = f.to
  }
  if (f.kind) {
    clauses.push(`${prefix}.kind = @kind`)
    params.kind = f.kind
  }
  if (f.sessionId) {
    clauses.push(`${prefix}.session_id = @sessionId`)
    params.sessionId = f.sessionId
  }
  // named parameters can't hold a list, so these are expanded positionally into
  // uniquely-named placeholders rather than interpolated
  if (f.provider?.length) {
    const names = f.provider.map((v, i) => {
      params[`prov${i}`] = v
      return `@prov${i}`
    })
    clauses.push(`${prefix}.provider IN (${names.join(', ')})`)
  }
  if (f.scopeHash?.length) {
    const names = f.scopeHash.map((v, i) => {
      params[`scope${i}`] = v
      return `@scope${i}`
    })
    clauses.push(`${prefix}.scope_hash IN (${names.join(', ')})`)
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params }
}

/** SQLite has no date_trunc; these are the local-time bucket expressions. */
const BUCKET: Record<Granularity, string> = {
  hour: `strftime('%Y-%m-%dT%H:00:00', e.ts / 1000, 'unixepoch', 'localtime')`,
  day: `strftime('%Y-%m-%dT00:00:00', e.ts / 1000, 'unixepoch', 'localtime')`,
  week: `strftime('%Y-%m-%dT00:00:00', e.ts / 1000, 'unixepoch', 'localtime', 'weekday 1', '-7 days')`,
  month: `strftime('%Y-%m-01T00:00:00', e.ts / 1000, 'unixepoch', 'localtime')`,
}

/**
 * Sums of individual token buckets. `qty_json` is JSON rather than columns
 * because the contract is provider-agnostic, so the numbers come back out with
 * json_extract. SQLite's JSON1 handles this fine at our row counts.
 */
const QTY_SUMS = `
  COALESCE(SUM(json_extract(e.qty_json, '$.in')), 0)            AS qtyIn,
  COALESCE(SUM(json_extract(e.qty_json, '$.out')), 0)           AS qtyOut,
  COALESCE(SUM(json_extract(e.qty_json, '$.cacheCreate')), 0)   AS qtyCacheCreate,
  COALESCE(SUM(json_extract(e.qty_json, '$.cacheCreate1h')), 0) AS qtyCacheCreate1h,
  COALESCE(SUM(json_extract(e.qty_json, '$.cacheRead')), 0)     AS qtyCacheRead
`

const TOTALS = `
  COALESCE(SUM(e.cost_usd), 0)          AS costUsd,
  SUM(CASE WHEN e.cost_usd IS NULL THEN 1 ELSE 0 END) AS unpricedEvents,
  COALESCE(SUM(e.qty_total), 0)         AS tokens,
  COUNT(*)                              AS events,
  COUNT(DISTINCT e.session_id)          AS sessions,
  ${QTY_SUMS}
`

export interface TotalsRow {
  costUsd: number
  unpricedEvents: number
  tokens: number
  events: number
  sessions: number
  qtyIn: number
  qtyOut: number
  qtyCacheCreate: number
  qtyCacheCreate1h: number
  qtyCacheRead: number
}

export class Queries {
  constructor(private readonly sqlite: BetterSqlite3.Database) {}

  totals(f: Filters = {}): TotalsRow {
    const w = buildWhere(f)
    return this.sqlite
      .prepare(`SELECT ${TOTALS} FROM events e ${w.sql}`)
      .get(w.params) as TotalsRow
  }

  /**
   * Time series, optionally split by a dimension so the Timeline screen can
   * stack by model without N round trips.
   */
  series(
    granularity: Granularity,
    f: Filters = {},
    groupBy?: 'unitLabel' | 'provider' | 'scopeHash',
  ): Array<TotalsRow & { bucket: string, group: string | null }> {
    const w = buildWhere(f)
    const col = groupBy === 'unitLabel'
      ? 'e.unit_label'
      : groupBy === 'provider'
        ? 'e.provider'
        : groupBy === 'scopeHash' ? 'e.scope_hash' : null

    const groupSelect = col ? `${col} AS "group",` : `NULL AS "group",`
    const groupClause = col ? `, ${col}` : ''

    return this.sqlite.prepare(`
      SELECT ${BUCKET[granularity]} AS bucket, ${groupSelect} ${TOTALS}
      FROM events e ${w.sql}
      GROUP BY bucket${groupClause}
      ORDER BY bucket ASC
    `).all(w.params) as Array<TotalsRow & { bucket: string, group: string | null }>
  }

  /** weekday (0=Sunday) x hour grid for the Timeline heatmap. */
  heatmap(f: Filters = {}): Array<{ weekday: number, hour: number, costUsd: number, tokens: number, events: number }> {
    const w = buildWhere(f)
    return this.sqlite.prepare(`
      SELECT
        CAST(strftime('%w', e.ts / 1000, 'unixepoch', 'localtime') AS INTEGER) AS weekday,
        CAST(strftime('%H', e.ts / 1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
        COALESCE(SUM(e.cost_usd), 0)  AS costUsd,
        COALESCE(SUM(e.qty_total), 0) AS tokens,
        COUNT(*)                      AS events
      FROM events e ${w.sql}
      GROUP BY weekday, hour
    `).all(w.params) as Array<{ weekday: number, hour: number, costUsd: number, tokens: number, events: number }>
  }

  byScope(f: Filters = {}): Array<TotalsRow & { scopeHash: string, label: string | null, lastSeen: number | null }> {
    const w = buildWhere(f)
    return this.sqlite.prepare(`
      SELECT e.scope_hash AS scopeHash, s.label AS label, s.last_seen AS lastSeen, ${TOTALS}
      FROM events e
      LEFT JOIN scopes s ON s.scope_hash = e.scope_hash
      ${w.sql}
      GROUP BY e.scope_hash
      ORDER BY costUsd DESC
    `).all(w.params) as Array<TotalsRow & { scopeHash: string, label: string | null, lastSeen: number | null }>
  }

  byProvider(f: Filters = {}): Array<TotalsRow & { provider: string }> {
    const w = buildWhere(f)
    return this.sqlite.prepare(`
      SELECT e.provider AS provider, ${TOTALS}
      FROM events e ${w.sql}
      GROUP BY e.provider
      ORDER BY costUsd DESC
    `).all(w.params) as Array<TotalsRow & { provider: string }>
  }

  byUnitLabel(f: Filters = {}): Array<TotalsRow & { unitLabel: string | null }> {
    const w = buildWhere(f)
    return this.sqlite.prepare(`
      SELECT e.unit_label AS unitLabel, ${TOTALS}
      FROM events e ${w.sql}
      GROUP BY e.unit_label
      ORDER BY costUsd DESC
    `).all(w.params) as Array<TotalsRow & { unitLabel: string | null }>
  }

  sessions(f: Filters = {}, limit = 200): Array<TotalsRow & {
    sessionId: string
    scopeHash: string
    label: string | null
    startedAt: number
    endedAt: number
  }> {
    const w = buildWhere(f)
    const params = { ...w.params, limit }
    return this.sqlite.prepare(`
      SELECT
        e.session_id AS sessionId,
        MIN(e.scope_hash) AS scopeHash,
        MIN(e.ts) AS startedAt,
        MAX(e.ts) AS endedAt,
        ${TOTALS}
      FROM events e
      ${w.sql}${w.sql ? ' AND' : 'WHERE'} e.session_id IS NOT NULL
      GROUP BY e.session_id
      ORDER BY endedAt DESC
      LIMIT @limit
    `).all(params).map((row) => {
      const r = row as TotalsRow & { sessionId: string, scopeHash: string, startedAt: number, endedAt: number }
      const scope = this.sqlite
        .prepare('SELECT label FROM scopes WHERE scope_hash = ?')
        .pluck()
        .get(r.scopeHash) as string | undefined
      return { ...r, label: scope ?? null }
    })
  }

  /** Raw events for one session, for the drill-down timeline. */
  sessionEvents(sessionId: string, limit = 2000): Array<{
    id: string
    ts: number
    unitLabel: string | null
    costUsd: number | null
    qty: Record<string, number>
    meta: Record<string, number>
  }> {
    return this.sqlite.prepare(`
      SELECT id, ts, unit_label AS unitLabel, cost_usd AS costUsd, qty_json AS qtyJson, meta_json AS metaJson
      FROM events WHERE session_id = ? ORDER BY ts ASC LIMIT ?
    `).all(sessionId, limit).map((row) => {
      const r = row as { id: string, ts: number, unitLabel: string | null, costUsd: number | null, qtyJson: string, metaJson: string }
      return {
        id: r.id,
        ts: r.ts,
        unitLabel: r.unitLabel,
        costUsd: r.costUsd,
        qty: JSON.parse(r.qtyJson) as Record<string, number>,
        meta: JSON.parse(r.metaJson) as Record<string, number>,
      }
    })
  }

  limitSnapshots(provider?: string, window?: string, since?: number): LimitSnapshot[] {
    const clauses: string[] = []
    const params: Record<string, unknown> = {}
    if (provider) {
      clauses.push('provider = @provider')
      params.provider = provider
    }
    if (window) {
      clauses.push('window = @window')
      params.window = window
    }
    if (since !== undefined) {
      clauses.push('ts >= @since')
      params.since = since
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    return this.sqlite.prepare(`
      SELECT ts, provider, window, used_pct AS usedPct, resets_at AS resetsAt
      FROM limits ${where} ORDER BY ts ASC
    `).all(params) as LimitSnapshot[]
  }

  /** Distinct (provider, window) pairs that have any limit history. */
  limitWindows(): Array<{ provider: string, window: string }> {
    return this.sqlite
      .prepare('SELECT DISTINCT provider, window FROM limits ORDER BY provider, window')
      .all() as Array<{ provider: string, window: string }>
  }

  scopeLabels(): Array<{ scopeHash: string, label: string, provider: string, lastSeen: number }> {
    return this.sqlite.prepare(`
      SELECT scope_hash AS scopeHash, label, provider, last_seen AS lastSeen
      FROM scopes ORDER BY last_seen DESC
    `).all() as Array<{ scopeHash: string, label: string, provider: string, lastSeen: number }>
  }

  /**
   * Lines the agent changed while earning the spend in `f`.
   *
   * Read from token-kind events, where the JSONL parser attributes each diff to
   * the turn that produced it, so this works with no status line hook
   * installed. `meta` is numbers-only by contract, so json_extract is safe here.
   */
  lineTotals(f: Filters = {}): { added: number, removed: number } {
    const w = buildWhere(f)
    const row = this.sqlite.prepare(`
      SELECT
        COALESCE(SUM(json_extract(e.meta_json, '$.linesAdded')), 0)   AS added,
        COALESCE(SUM(json_extract(e.meta_json, '$.linesRemoved')), 0) AS removed
      FROM events e ${w.sql}
    `).get(w.params) as { added: number, removed: number }
    return row
  }

  /** Bounds of the whole dataset — drives the empty state and default range. */
  bounds(): { first: number | null, last: number | null, events: number } {
    return this.sqlite
      .prepare('SELECT MIN(ts) AS first, MAX(ts) AS last, COUNT(*) AS events FROM events')
      .get() as { first: number | null, last: number | null, events: number }
  }
}
