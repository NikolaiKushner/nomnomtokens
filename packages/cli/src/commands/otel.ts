import {
  eventsToOtlp,
  totalTokens,
  type OtelEvent,
} from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c } from '../format.js'
import { scan } from './scan.js'

export interface OtelOptions {
  db?: string
  endpoint: string
  once?: boolean
  watch?: boolean
  scan?: boolean
  includeLabels?: boolean
  quiet?: boolean
}

function otelEvents(q: Queries, includeLabels: boolean): OtelEvent[] {
  const labels = new Map(q.scopeLabels().map(s => [s.scopeHash, s.label]))
  return q.exportSpendEvents().map((e) => {
    const row: OtelEvent = {
      ts: e.ts,
      provider: e.provider,
      unitLabel: e.unitLabel,
      scopeHash: e.scopeHash,
      costUsd: e.costUsd,
      tokens: totalTokens(e.qty),
    }
    if (includeLabels) row.label = labels.get(e.scopeHash) ?? null
    return row
  })
}

async function postOtlp(endpoint: string, body: unknown): Promise<void> {
  const url = endpoint.replace(/\/$/, '')
  const target = url.endsWith('/v1/metrics') ? url : `${url}/v1/metrics`
  const res = await fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OTLP POST ${res.status} ${text.slice(0, 200)}`)
  }
}

/**
 * Opt-in OTLP/HTTP export of numbers already in the local store.
 * Never called from scan/serve — you have to type the command.
 */
export async function otelCommand(opts: OtelOptions): Promise<void> {
  const endpoint = opts.endpoint.trim()
  if (!endpoint) {
    console.error(c.red('nnt otel requires --endpoint'))
    process.exitCode = 1
    return
  }

  if (opts.scan || opts.watch) {
    await scan({ db: opts.db, quiet: true })
  }

  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)
  const events = otelEvents(q, Boolean(opts.includeLabels))
  sqlite.close()

  const body = eventsToOtlp(events, { includeLabels: opts.includeLabels })
  try {
    await postOtlp(endpoint, body)
  } catch (err) {
    console.error(c.red(err instanceof Error ? err.message : String(err)))
    process.exitCode = 1
    return
  }

  if (!opts.quiet) {
    console.log(
      `${c.cyan('otel')}  ${c.bold(String(events.length))} events → ${endpoint}`,
    )
    console.log(c.dim(`from ${dbPath} · numbers and hashes only`))
  }
}
