import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  claudeProjectsDir,
  codexSessionsDir,
  cursorStateDbPath,
  detectAdapters,
} from '@nomnomtokens/adapters'
import { defaultDbPath, openDb, Queries } from '@nomnomtokens/db'
import { c, compactNumber, usd } from '../format.js'

/** `nnt doctor` answers "why is the dashboard empty?" without reading source. */

export const DEFAULT_CLEANUP_DAYS = 30

export function readCleanupPeriodDays(settingsPath: string): number {
  if (!existsSync(settingsPath)) return DEFAULT_CLEANUP_DAYS
  try {
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      cleanupPeriodDays?: unknown
    }
    const n = parsed.cleanupPeriodDays
    return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : DEFAULT_CLEANUP_DAYS
  } catch {
    return DEFAULT_CLEANUP_DAYS
  }
}

export function listJsonlFiles(root: string): string[] {
  if (!existsSync(root)) return []
  const out: string[] = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()!
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) stack.push(path)
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(path)
    }
  }
  return out
}

export function oldestMtime(paths: string[]): number | null {
  let min: number | null = null
  for (const path of paths) {
    try {
      const t = statSync(path).mtimeMs
      if (min === null || t < min) min = t
    } catch {
      // skip unreadable
    }
  }
  return min
}

/**
 * Store already holds history that Claude Code will (or already did) delete
 * from ~/.claude/projects. Null when there is nothing to warn about.
 */
export function transcriptRetentionWarning(opts: {
  storeFirst: number | null
  oldestJsonlMtime: number | null
  cleanupDays: number
  now?: number
}): string | null {
  if (opts.storeFirst === null) return null
  const now = opts.now ?? Date.now()
  const cutoff = now - opts.cleanupDays * 86_400_000
  const storeOlderThanRetention = opts.storeFirst < cutoff
  const transcriptsAlreadyGone = opts.oldestJsonlMtime !== null
    && opts.oldestJsonlMtime > opts.storeFirst + 86_400_000
  if (!storeOlderThanRetention && !transcriptsAlreadyGone) return null
  return `store keeps history from ${new Date(opts.storeFirst).toISOString().slice(0, 10)}; transcripts will not (cleanupPeriodDays=${opts.cleanupDays})`
}

function check(ok: boolean, label: string, detail?: string): void {
  const mark = ok ? c.green('✔') : c.yellow('✗')
  console.log(`${mark} ${label}${detail ? c.dim(`  ${detail}`) : ''}`)
}

export interface DoctorOptions {
  db?: string
  claudeSettings?: string
  claudeProjects?: string
}

export async function doctor(opts: DoctorOptions = {}): Promise<void> {
  console.log(c.bold('nomnomtokens doctor'))
  console.log()

  console.log(c.bold('Sources'))
  const projects = opts.claudeProjects ?? claudeProjectsDir()
  check(existsSync(projects), 'Claude Code transcripts', projects)

  const cursorDb = cursorStateDbPath()
  check(existsSync(cursorDb), 'Cursor state database', cursorDb)

  const codexSessions = codexSessionsDir()
  check(existsSync(codexSessions), 'Codex session rollouts', codexSessions)

  const adapters = await detectAdapters()
  check(adapters.length > 0, `${adapters.length} adapter(s) detected`, adapters.map(a => a.name).join(', ') || 'none')

  console.log()
  console.log(c.bold('Status line'))
  const settingsFile = opts.claudeSettings ?? join(homedir(), '.claude', 'settings.json')
  let statusLineCommand: string | undefined
  if (existsSync(settingsFile)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsFile, 'utf8')) as {
        statusLine?: { command?: string }
      }
      statusLineCommand = parsed.statusLine?.command
    } catch {
      statusLineCommand = undefined
    }
  }
  const wired = statusLineCommand?.includes('nomnomtokens') ?? false
  check(wired, 'hook installed', statusLineCommand ?? 'not configured — run `nnt init`')
  if (!wired) {
    console.log(c.dim('  Without it: history still works, but limits and live updates do not.'))
  }

  console.log()
  console.log(c.bold('Store'))
  const dbPath = opts.db ?? defaultDbPath()
  const exists = existsSync(dbPath)
  check(exists, 'database', exists ? `${dbPath} (${(statSync(dbPath).size / 1e6).toFixed(1)} MB)` : `${dbPath} — run \`nnt scan\``)

  if (exists) {
    const { sqlite } = openDb(dbPath)
    const q = new Queries(sqlite)
    const bounds = q.bounds()
    const totals = q.totals({ kind: 'tokens' })
    const windows = q.limitWindows()

    check(bounds.events > 0, `${bounds.events} events`, bounds.first
      ? `${new Date(bounds.first).toISOString().slice(0, 10)} → ${new Date(bounds.last!).toISOString().slice(0, 10)}`
      : 'empty — run `nnt scan`')
    console.log(c.dim(`  lifetime: ${usd(totals.costUsd)}, ${compactNumber(totals.tokens)} tokens, ${totals.sessions} sessions`))

    if (totals.unpricedEvents > 0) {
      check(false, `${totals.unpricedEvents} events could not be priced`, 'unknown model id — see packages/core/src/pricing.ts')
    }
    check(windows.length > 0, 'limit history', windows.length > 0
      ? windows.map(w => `${w.provider}/${w.window}`).join(', ')
      : 'none yet — the status line hook has not fired')

    const cleanupDays = readCleanupPeriodDays(settingsFile)
    const jsonl = listJsonlFiles(projects)
    const warning = transcriptRetentionWarning({
      storeFirst: bounds.first,
      oldestJsonlMtime: oldestMtime(jsonl),
      cleanupDays,
    })
    check(!warning, 'transcript retention', warning ?? `cleanupPeriodDays ${cleanupDays}`)

    sqlite.close()
  }

  console.log()
  console.log(c.dim('Nothing above ever leaves this machine. See docs/privacy.md.'))
}
