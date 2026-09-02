import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  bucketStart,
  formatExportCsv,
  formatExportJson,
  formatNntArchive,
} from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c, compactNumber } from '../format.js'

export interface ExportOptions {
  db?: string
  format?: 'csv' | 'json' | 'nnt'
  out?: string
  range?: '24h' | '7d' | '30d' | '90d' | 'all'
  provider?: string
  client?: string
  quiet?: boolean
}

function rangeFrom(range: ExportOptions['range'], now = Date.now()): number | undefined {
  switch (range) {
    case '24h': return now - 24 * 60 * 60 * 1000
    case '7d': return now - 7 * 24 * 60 * 60 * 1000
    case '30d': return now - 30 * 24 * 60 * 60 * 1000
    case '90d': return now - 90 * 24 * 60 * 60 * 1000
    case 'all':
    case undefined:
      return undefined
    default:
      return bucketStart(now, 'day') - 7 * 24 * 60 * 60 * 1000
  }
}

/**
 * `nnt export` — dump filtered events for spreadsheets or client invoices,
 * or `--format nnt` for a machine-portable store archive.
 */
export function exportCommand(opts: ExportOptions = {}): void {
  const format = opts.format === 'json' || opts.format === 'nnt' ? opts.format : 'csv'
  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)

  let body: string
  let count: number

  if (format === 'nnt') {
    const scopes = q.scopeLabels()
    body = formatNntArchive({
      version: 1,
      events: q.exportSpendEvents(),
      limits: q.limitSnapshots(),
      scopes: scopes.map(s => ({
        scopeHash: s.scopeHash,
        label: s.label,
        provider: s.provider,
        lastSeen: s.lastSeen,
        client: s.client,
        labelLocked: s.labelLocked,
      })),
    })
    count = q.bounds().events
    if (!opts.quiet) {
      console.error(c.dim('nnt archive includes local project labels. Treat the file as the whole store.'))
    }
  } else {
    const from = rangeFrom(opts.range ?? '30d')
    const rows = q.exportEvents({
      from,
      kind: 'tokens',
      provider: opts.provider ? [opts.provider] : undefined,
      client: opts.client,
    })
    body = format === 'json' ? formatExportJson(rows) : formatExportCsv(rows)
    count = rows.length
  }

  sqlite.close()

  if (opts.out) {
    const dest = resolve(opts.out)
    writeFileSync(dest, body, 'utf8')
    if (!opts.quiet) {
      console.log(
        `${c.cyan('export')}  ${c.bold(String(count))} events → ${dest}`,
      )
      console.log(c.dim(`from ${dbPath}`))
    }
    return
  }

  process.stdout.write(body)
  if (!opts.quiet && process.stdout.isTTY) {
    console.error(c.dim(`${compactNumber(count)} events · ${format}`))
  }
}
