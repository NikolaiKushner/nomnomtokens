import type { StatuslinePayload } from '@nomnomtokens/adapters'
import { parseStatusline } from '@nomnomtokens/adapters'
import { moodFor } from '@nomnomtokens/core'
import { openDb, Repo } from '@nomnomtokens/db'
import { compactNumber, untilReset, usd } from '../format.js'

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

const MOOD_FACE: Record<string, string> = {
  hungry: '(・_・)',
  content: '(^_^)',
  full: '(＾ｕ＾)',
  stuffed: '(>_<)',
  overstuffed: '(x_x)',
}

/**
 * A limit window as one segment: `5h 73% ·1h47m`.
 *
 * The percentage says how much is gone, the countdown says how long until it
 * comes back — one is not actionable without the other. The countdown is
 * dropped rather than faked when the payload omits `resets_at`, which older
 * Claude Code versions do.
 */
function limitSegment(label: string, usedPct: number, resetsAtSeconds?: number): string {
  // The payload counts in unix seconds; everything downstream of here is ms.
  const resetsAt = typeof resetsAtSeconds === 'number' && Number.isFinite(resetsAtSeconds)
    ? resetsAtSeconds * 1000
    : null
  const left = untilReset(resetsAt)
  return `${label} ${Math.round(usedPct)}%${left ? ` ·${left}` : ''}`
}

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

  // Render first, persist second: the user's status bar should not wait on a
  // database write, and a locked DB must never blank the bar.
  const parts: string[] = []
  parts.push(MOOD_FACE[moodFor(Math.max(fiveHour ?? 0, sevenDay ?? 0))] ?? '(^_^)')
  if (cost !== null) parts.push(usd(cost))
  if (ctx !== null) parts.push(`ctx ${Math.round(ctx)}%`)
  if (fiveHour !== null) parts.push(limitSegment('5h', fiveHour, limits?.five_hour?.resets_at))
  if (sevenDay !== null) parts.push(limitSegment('7d', sevenDay, limits?.seven_day?.resets_at))

  const lines = (payload.cost?.total_lines_added ?? 0) + (payload.cost?.total_lines_removed ?? 0)
  if (lines > 0) parts.push(`${compactNumber(lines)} lines`)

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
