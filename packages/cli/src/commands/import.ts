import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { looksLikeNntArchive, parseNntArchive } from '@nomnomtokens/core'
import { openDb, Repo } from '@nomnomtokens/db'
import { c, compactNumber } from '../format.js'
import { importCsvCommand } from './import-csv.js'

export interface ImportOptions {
  db?: string
  file: string
  provider?: string
  kind?: string
  quiet?: boolean
}

/**
 * `nnt import <file>` — billing CSV *or* an nnt archive JSON dump.
 * The archive carries local project labels; treat the file as the whole store.
 */
export async function importCommand(opts: ImportOptions): Promise<void> {
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

  if (looksLikeNntArchive(text)) {
    let records
    try {
      records = parseNntArchive(text)
    } catch (err) {
      console.error(c.red(err instanceof Error ? err.message : String(err)))
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
      console.log(
        `${c.cyan('nnt')}  `
        + `${c.bold(String(added))} new  `
        + c.dim(
          `${result.events} events, ${result.duplicates} already known, `
          + `${result.limits} limits, ${result.scopes} scopes`,
        ),
      )
      console.log(c.dim(`${compactNumber(before + added)} events in ${dbPath}`))
      console.log(c.dim('Archive includes local project labels and client tags. scan_state is not imported.'))
    }
    return
  }

  await importCsvCommand(opts)
}
