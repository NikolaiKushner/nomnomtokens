import type { StatuslinePayload } from '@nomnomtokens/adapters'
import { parseStatusline } from '@nomnomtokens/adapters'
import { openDb, Queries, Repo } from '@nomnomtokens/db'
import { buildStatuslineParts, resolveWindow, type CachedWindow } from '../statusline-render.js'

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

interface StoredLimits {
  codexSevenDay: number | null
  claudeFive: CachedWindow | null
  claudeSeven: CachedWindow | null
}

function readStoredLimits(db?: string, now = Date.now()): StoredLimits {
  const empty: StoredLimits = { codexSevenDay: null, claudeFive: null, claudeSeven: null }
  try {
    const { sqlite } = openDb(db)
    const latest = new Queries(sqlite).latestLimits()
    sqlite.close()
    const claude = (window: string): CachedWindow | null => {
      const row = latest.find(l => l.provider === 'claude-code' && l.window === window)
      return row ? { usedPct: row.usedPct, resetsAt: row.resetsAt } : null
    }
    const codex = latest.find(l => l.provider === 'codex' && l.window === '7d')
    return {
      codexSevenDay: codex && now - codex.ts <= CODEX_FRESH_MS ? codex.usedPct : null,
      claudeFive: claude('5h'),
      claudeSeven: claude('7d'),
    }
  } catch {
    return empty
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
  const now = Date.now()
  const stored = readStoredLimits(opts.db, now)
  // Claude often omits rate_limits until the first API turn. The last snapshot
  // whose window is still open is enough to paint the bar on that first render.
  const five = resolveWindow(
    limits?.five_hour?.used_percentage ?? null,
    limits?.five_hour?.resets_at,
    stored.claudeFive,
    now,
  )
  const seven = resolveWindow(
    limits?.seven_day?.used_percentage ?? null,
    limits?.seven_day?.resets_at,
    stored.claudeSeven,
    now,
  )
  const ctx = payload.context_window?.used_percentage ?? null
  const model = payload.model?.display_name?.trim() || payload.model?.id?.trim() || null

  const line = buildStatuslineParts({
    fiveHour: five.pct,
    sevenDay: seven.pct,
    fiveHourResetsAt: five.resetsAtSeconds,
    sevenDayResetsAt: seven.resetsAtSeconds,
    ctx,
    model,
    codexSevenDay: stored.codexSevenDay,
    now,
  })

  process.stdout.write(`${line}\n`)

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
