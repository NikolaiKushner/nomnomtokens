import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bucketStart, formatExportCsv, formatExportJson } from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c, compactNumber } from '../format.js'

export interface ExportOptions {
  db?: string
  format?: 'csv' | 'json'
  out?: string
  range?: '24h' | '7d' | '30d' | '90d' | 'all'
  provider?: string
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
 * `nnt export` — dump filtered events for spreadsheets or client invoices.
 */
export function exportCommand(opts: ExportOptions = {}): void {
  const format = opts.format === 'json' ? 'json' : 'csv'
  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)
  const from = rangeFrom(opts.range ?? '30d')
  const rows = q.exportEvents({
    from,
    kind: 'tokens',
    provider: opts.provider ? [opts.provider] : undefined,
  })
  sqlite.close()

  const body = format === 'json' ? formatExportJson(rows) : formatExportCsv(rows)
  if (opts.out) {
    const dest = resolve(opts.out)
    writeFileSync(dest, body, 'utf8')
    if (!opts.quiet) {
      console.log(
        `${c.cyan('export')}  ${c.bold(String(rows.length))} events → ${dest}`,
      )
      console.log(c.dim(`from ${dbPath}`))
    }
    return
  }

  process.stdout.write(body)
  if (!opts.quiet && process.stdout.isTTY) {
    console.error(c.dim(`${compactNumber(rows.length)} events · ${format}`))
  }
}
