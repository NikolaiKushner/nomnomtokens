import { existsSync, readFileSync, statSync } from 'node:fs'
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

function check(ok: boolean, label: string, detail?: string): void {
  const mark = ok ? c.green('✔') : c.yellow('✗')
  console.log(`${mark} ${label}${detail ? c.dim(`  ${detail}`) : ''}`)
}

export async function doctor(opts: { db?: string } = {}): Promise<void> {
  console.log(c.bold('nomnomtokens doctor'))
  console.log()

  console.log(c.bold('Sources'))
  const projects = claudeProjectsDir()
  check(existsSync(projects), 'Claude Code transcripts', projects)

  const cursorDb = cursorStateDbPath()
  check(existsSync(cursorDb), 'Cursor state database', cursorDb)

  const codexSessions = codexSessionsDir()
  check(existsSync(codexSessions), 'Codex session rollouts', codexSessions)

  const adapters = await detectAdapters()
  check(adapters.length > 0, `${adapters.length} adapter(s) detected`, adapters.map(a => a.name).join(', ') || 'none')

  console.log()
  console.log(c.bold('Status line'))
  const settingsFile = join(homedir(), '.claude', 'settings.json')
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

    sqlite.close()
  }

  console.log()
  console.log(c.dim('Nothing above ever leaves this machine. See docs/privacy.md.'))
}
