import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { importCsv } from '@nomnomtokens/adapters'
import { loadPriceTable, openDb, Repo } from '@nomnomtokens/db'
import { c, compactNumber, usd } from '../format.js'

export interface ImportCsvOptions {
  db?: string
  file: string
  provider?: string
  kind?: string
  quiet?: boolean
}

/**
 * `nnt import <file.csv>` — feed a billing export or spreadsheet into the store.
 * Re-importing the same file is idempotent (row hash → event id).
 */
export async function importCsvCommand(opts: ImportCsvOptions): Promise<void> {
  const path = resolve(opts.file)
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    console.error(c.red(`Cannot read ${path}`))
    console.error(c.dim(err instanceof Error ? err.message : String(err)))
    process.exitCode = 1
    return
  }

  const { prices } = loadPriceTable()
  let records
  try {
    records = await importCsv(text, {
      provider: opts.provider,
      kind: opts.kind,
      prices,
    })
  } catch (err) {
    console.error(c.red(err instanceof Error ? err.message : String(err)))
    process.exitCode = 1
    return
  }

  if (records.length === 0) {
    console.error(c.yellow('No rows imported — empty file or nothing with a parseable timestamp.'))
    process.exitCode = 1
    return
  }

  const { sqlite, path: dbPath } = openDb(opts.db)
  const repo = new Repo(sqlite)
  const before = repo.eventCount()
  const result = repo.ingest(records)
  const added = repo.eventCount() - before
  sqlite.close()

  if (!opts.quiet) {
    const cost = records.reduce((s, r) => {
      if (r.type !== 'event') return s
      return s + (r.event.costUsd ?? 0)
    }, 0)
    console.log(
      `${c.cyan('csv')}  `
      + `${c.bold(String(added))} new  `
      + c.dim(
        `${result.events} events, ${result.duplicates} already known, `
        + `${result.scopes} scopes · ~${usd(cost)} in file`,
      ),
    )
    console.log(c.dim(`${compactNumber(before + added)} events in ${dbPath}`))
  }
}
