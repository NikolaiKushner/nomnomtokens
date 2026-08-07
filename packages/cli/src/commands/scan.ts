import { detectAdapters } from '@nomnomtokens/adapters'
import type { IngestRecord } from '@nomnomtokens/core'
import { openDb, Queries, Repo } from '@nomnomtokens/db'
import { bucketStart } from '@nomnomtokens/core'
import { c, compactNumber, duration, usd } from '../format.js'

export interface ScanOptions {
  db?: string
  watch?: boolean
  quiet?: boolean
}

export async function scan(opts: ScanOptions = {}): Promise<void> {
  const started = Date.now()
  const { db: _drizzle, sqlite, path } = openDb(opts.db)
  const repo = new Repo(sqlite)
  const queries = new Queries(sqlite)
  const state = repo.scanState()

  const adapters = await detectAdapters()
  if (adapters.length === 0) {
    console.error(c.yellow('No sources detected on this machine.'))
    console.error(c.dim('Looks for ~/.claude/projects, Cursor state.vscdb, and ~/.codex/sessions. Run `nnt doctor`.'))
    process.exitCode = 1
    return
  }

  for (const adapter of adapters) {
    // Drained in chunks so a first scan of a year of logs never materialises in
    // memory, and so a Ctrl-C halfway through still leaves the earlier chunks
    // committed with their scan cursors.
    const records: AsyncIterable<IngestRecord> = adapter.scan(state)
    const result = { events: 0, written: 0, duplicates: 0, limits: 0, scopes: 0 }
    // Row count before/after is the only honest measure of "new": an upsert
    // that rewrites an identical row still reports a change, so `written`
    // alone would count Claude Code's repeated turns as fresh data.
    const rowsBefore = repo.eventCount()
    let batch: IngestRecord[] = []

    const flush = () => {
      if (batch.length === 0) return
      const r = repo.ingest(batch)
      result.events += r.events
      result.written += r.written
      result.duplicates += r.duplicates
      result.limits += r.limits
      result.scopes += r.scopes
      batch = []
    }

    for await (const rec of records) {
      batch.push(rec)
      if (batch.length >= 5000) flush()
    }
    flush()

    const added = repo.eventCount() - rowsBefore
    if (!opts.quiet) {
      const repeats = result.events - added
      console.log(
        `${c.cyan(adapter.name)}  `
        + `${c.bold(String(added))} new  `
        + c.dim(
          `${result.events} seen, ${repeats} repeated by the source, `
          + `${result.limits} limits, ${result.scopes} scopes`,
        ),
      )
    }
  }

  const repaired = repo.repairPlaceholderLabels()
  if (!opts.quiet && repaired > 0) {
    console.log(c.dim(`normalized ${repaired} Cursor Auto placeholder label(s) → unknown`))
  }

  if (!opts.quiet) {
    const todayStart = bucketStart(Date.now(), 'day')
    const today = queries.totals({ from: todayStart, kind: 'tokens' })
    const all = queries.bounds()

    console.log()
    console.log(
      `${c.bold('Eaten today')}  ${c.green(usd(today.costUsd))}  `
      + c.dim(`${compactNumber(today.tokens)} tokens, ${today.sessions} sessions`),
    )
    if (today.unpricedEvents > 0) {
      console.log(c.dim(`  (${today.unpricedEvents} events had no price and are excluded from cost)`))
    }
    console.log(
      c.dim(`${all.events} events in ${path} — scanned in ${duration(Date.now() - started)}`),
    )
  }

  if (opts.watch) {
    console.log(c.dim('\nWatching for changes. Ctrl-C to stop.'))
    const stops = adapters
      .filter(a => a.watch)
      .map(a => a.watch!(rec => repo.ingest([rec])))
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        stops.forEach(stop => stop())
        resolve()
      })
    })
  }

  sqlite.close()
}
