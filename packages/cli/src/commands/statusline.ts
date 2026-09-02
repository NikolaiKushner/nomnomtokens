import type { StatuslinePayload } from '@nomnomtokens/adapters'
import { parseStatusline } from '@nomnomtokens/adapters'
import { openDb, Queries, Repo } from '@nomnomtokens/db'
import { buildStatuslineParts } from '../statusline-render.js'

/**
 * `nnt statusline` is both an ingest hook and a real status line.
 *
 * Claude Code pipes its session JSON to whatever `statusLine.command` points
 * at and renders the stdout. We use that call to capture the two things the
 * transcript never contains — subscription limits and per-session line counts —
 * and pay the user back by printing something worth having in the bar.
 *
 * It must be fast and it must never fail loudly: a hook that throws puts an
 * error in the user's status bar on every render.
 */

const CODEX_FRESH_MS = 24 * 3_600_000

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

export interface StatuslineOptions {
  db?: string
  /** skip the write and only render — useful for testing the output format */
  dryRun?: boolean
}

function readCodexWeekly(db?: string): number | null {
  try {
    const { sqlite } = openDb(db)
    const q = new Queries(sqlite)
    const latest = q.latestLimits()
    sqlite.close()
    const row = latest.find(l => l.provider === 'codex' && l.window === '7d')
    if (!row) return null
    if (Date.now() - row.ts > CODEX_FRESH_MS) return null
    return row.usedPct
  } catch {
    return null
  }
}

export async function statusline(opts: StatuslineOptions = {}): Promise<void> {
  let payload: StatuslinePayload
  try {
    payload = JSON.parse(await readStdin()) as StatuslinePayload
  } catch {
    // No payload means we were run by hand. Say so instead of printing nothing.
    process.stdout.write('nomnomtokens: expected Claude Code session JSON on stdin\n')
    return
  }

  const limits = payload.rate_limits
  const fiveHour = limits?.five_hour?.used_percentage ?? null
  const sevenDay = limits?.seven_day?.used_percentage ?? null
  const cost = payload.cost?.total_cost_usd ?? null
  const ctx = payload.context_window?.used_percentage ?? null
  const lines = (payload.cost?.total_lines_added ?? 0) + (payload.cost?.total_lines_removed ?? 0)
  const codexSevenDay = readCodexWeekly(opts.db)

  const parts = buildStatuslineParts({
    fiveHour,
    sevenDay,
    fiveHourResetsAt: limits?.five_hour?.resets_at,
    sevenDayResetsAt: limits?.seven_day?.resets_at,
    cost,
    ctx,
    lines,
    codexSevenDay,
  })

  process.stdout.write(`${parts.join('  ')}\n`)

  if (opts.dryRun) return

  try {
    const { sqlite } = openDb(opts.db)
    const repo = new Repo(sqlite)
    repo.ingest(await parseStatusline(payload))
    sqlite.close()
  } catch {
    // Swallowed on purpose. Losing one statusline sample is invisible; an
    // exception here would print a stack trace into the status bar forever.
  }
}
