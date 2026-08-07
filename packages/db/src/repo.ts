import type { IngestRecord, ScanCursor, ScanState, SpendEvent } from '@nomnomtokens/core'
import { totalTokens } from '@nomnomtokens/core'
import type BetterSqlite3 from 'better-sqlite3'

export interface IngestResult {
  /** spend events seen in the source */
  events: number
  /** rows actually written (a first insert, or an upsert that raised the counts) */
  written: number
  /** events the source repeated with counts we already had — see docs/architecture.md */
  duplicates: number
  limits: number
  scopes: number
}

/**
 * Writes go through prepared statements rather than the query builder: a full
 * scan of a year of history is ~100k statements, and the builder's per-call
 * overhead is the difference between "instant" and "coffee".
 */
export class Repo {
  private readonly insertEvent: BetterSqlite3.Statement
  private readonly upsertScope: BetterSqlite3.Statement
  private readonly insertLimit: BetterSqlite3.Statement
  private readonly getCursor: BetterSqlite3.Statement
  private readonly setCursor: BetterSqlite3.Statement

  constructor(private readonly sqlite: BetterSqlite3.Database) {
    // Always upsert. JSONL gets re-read, agents restart, a request that timed out
    // returns a 200 later — without this the numbers drift within the first week.
    //
    // The `WHERE excluded.qty_total >= events.qty_total` guard exists because
    // Claude Code writes the same (requestId, message.id) several times per
    // session, and an early write can be a streaming partial with lower counts.
    // Last-write-wins would let a partial clobber the final figure.
    this.insertEvent = sqlite.prepare(`
      INSERT INTO events (id, ts, provider, kind, session_id, scope_hash, unit_label, qty_json, cost_usd, meta_json, qty_total)
      VALUES (@id, @ts, @provider, @kind, @sessionId, @scopeHash, @unitLabel, @qtyJson, @costUsd, @metaJson, @qtyTotal)
      ON CONFLICT(id) DO UPDATE SET
        ts = excluded.ts,
        provider = excluded.provider,
        kind = excluded.kind,
        session_id = excluded.session_id,
        scope_hash = excluded.scope_hash,
        unit_label = excluded.unit_label,
        qty_json = excluded.qty_json,
        cost_usd = excluded.cost_usd,
        meta_json = excluded.meta_json,
        qty_total = excluded.qty_total
      WHERE excluded.qty_total >= events.qty_total
    `)

    this.upsertScope = sqlite.prepare(`
      INSERT INTO scopes (scope_hash, label, provider, last_seen)
      VALUES (@scopeHash, @label, @provider, @lastSeen)
      ON CONFLICT(scope_hash) DO UPDATE SET
        label = excluded.label,
        last_seen = MAX(scopes.last_seen, excluded.last_seen)
    `)

    this.insertLimit = sqlite.prepare(`
      INSERT INTO limits (ts, provider, window, used_pct, resets_at)
      VALUES (@ts, @provider, @window, @usedPct, @resetsAt)
      ON CONFLICT(provider, window, ts) DO UPDATE SET
        used_pct = excluded.used_pct,
        resets_at = excluded.resets_at
    `)

    this.getCursor = sqlite.prepare(
      'SELECT source_path AS sourcePath, mtime, size, offset FROM scan_state WHERE source_path = ?',
    )
    this.setCursor = sqlite.prepare(`
      INSERT INTO scan_state (source_path, mtime, size, offset)
      VALUES (@sourcePath, @mtime, @size, @offset)
      ON CONFLICT(source_path) DO UPDATE SET
        mtime = excluded.mtime, size = excluded.size, offset = excluded.offset
    `)
  }

  /** @returns true when the row was actually written (a lower-count duplicate is a no-op) */
  putEvent(e: SpendEvent): boolean {
    const info = this.insertEvent.run({
      id: e.id,
      ts: e.ts,
      provider: e.provider,
      kind: e.kind,
      sessionId: e.sessionId,
      scopeHash: e.scopeHash,
      unitLabel: e.unitLabel,
      qtyJson: JSON.stringify(e.qty),
      costUsd: e.costUsd,
      metaJson: JSON.stringify(e.meta),
      qtyTotal: e.kind === 'tokens'
        ? totalTokens(e.qty)
        : Object.values(e.qty).reduce((a, b) => a + b, 0),
    })
    return info.changes > 0
  }

  /** Bulk ingest inside one transaction. Returns counts for `nnt scan` output. */
  ingest(records: Iterable<IngestRecord>): IngestResult {
    const result: IngestResult = { events: 0, written: 0, duplicates: 0, limits: 0, scopes: 0 }

    const run = this.sqlite.transaction((batch: IngestRecord[]) => {
      for (const rec of batch) {
        if (rec.type === 'event') {
          result.events += 1
          if (this.putEvent(rec.event)) result.written += 1
          else result.duplicates += 1
        } else if (rec.type === 'limit') {
          this.insertLimit.run(rec.limit)
          result.limits += 1
        } else {
          this.upsertScope.run({
            scopeHash: rec.scopeHash,
            label: rec.label,
            provider: rec.provider,
            lastSeen: Date.now(),
          })
          result.scopes += 1
        }
      }
    })

    // chunk so a very large scan doesn't hold one enormous transaction open
    let batch: IngestRecord[] = []
    for (const rec of records) {
      batch.push(rec)
      if (batch.length >= 5000) {
        run(batch)
        batch = []
      }
    }
    if (batch.length > 0) run(batch)

    return result
  }

  scanState(): ScanState {
    return {
      get: (sourcePath: string) => this.getCursor.get(sourcePath) as ScanCursor | undefined,
      set: (cursor: ScanCursor) => {
        this.setCursor.run(cursor)
      },
    }
  }

  latestEventTs(): number | null {
    const row = this.sqlite.prepare('SELECT MAX(ts) AS ts FROM events').get() as { ts: number | null }
    return row?.ts ?? null
  }

  eventCount(): number {
    return this.sqlite.prepare('SELECT COUNT(*) AS c FROM events').pluck().get() as number
  }

  /**
   * Collapse Cursor Auto-mode placeholders (`default`, `default,default,…`)
   * into a null unit_label so the UI shows a single "unknown" bucket.
   */
  repairPlaceholderLabels(): number {
    const rows = this.sqlite.prepare(
      `SELECT DISTINCT unit_label AS label FROM events WHERE unit_label IS NOT NULL`,
    ).all() as Array<{ label: string }>

    let changes = 0
    const update = this.sqlite.prepare(
      `UPDATE events SET unit_label = NULL WHERE unit_label = ?`,
    )
    const run = this.sqlite.transaction(() => {
      for (const { label } of rows) {
        if (!isDefaultPlaceholderLabel(label)) continue
        changes += update.run(label).changes
      }
    })
    run()
    return changes
  }
}

/** True when a stored model id is only Cursor's Auto `default` (possibly repeated). */
function isDefaultPlaceholderLabel(label: string): boolean {
  const parts = label.split(',').map(p => p.trim().toLowerCase()).filter(Boolean)
  return parts.length > 0 && parts.every(p => p === 'default')
}
