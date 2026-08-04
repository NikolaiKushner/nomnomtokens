import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { c } from '../format.js'

/**
 * Wire the statusline hook into ~/.claude/settings.json.
 *
 * We are editing a file the user owns and that another program reads on every
 * keystroke, so: back it up, preserve unknown keys, refuse to clobber an
 * existing statusLine without --force, and print exactly what changed.
 */

export interface InitOptions {
  settings?: string
  force?: boolean
  /** print the change without writing it */
  dryRun?: boolean
}

function settingsPath(override?: string): string {
  return override ?? join(homedir(), '.claude', 'settings.json')
}

interface ClaudeSettings {
  statusLine?: { type?: string, command?: string, padding?: number }
  [key: string]: unknown
}

export function init(opts: InitOptions = {}): void {
  const path = settingsPath(opts.settings)
  const command = 'npx -y nomnomtokens statusline'

  let settings: ClaudeSettings = {}
  if (existsSync(path)) {
    const text = readFileSync(path, 'utf8')
    try {
      settings = JSON.parse(text) as ClaudeSettings
    } catch {
      console.error(c.red(`${path} is not valid JSON — refusing to overwrite it.`))
      console.error(c.dim('Fix the file (or pass --settings elsewhere) and run `nnt init` again.'))
      process.exitCode = 1
      return
    }
  }

  const existing = settings.statusLine?.command
  if (existing && existing !== command && !opts.force) {
    console.error(c.yellow('You already have a status line configured:'))
    console.error(`  ${existing}`)
    console.error()
    console.error('nomnomtokens can capture limits without owning the status line — it only')
    console.error('needs to be invoked with the session JSON. Either:')
    console.error(`  • add ${c.cyan('| npx -y nomnomtokens statusline')} to your own script, or`)
    console.error(`  • run ${c.cyan('nnt init --force')} to replace it.`)
    process.exitCode = 1
    return
  }

  if (existing === command) {
    console.log(c.green('Already wired up.'))
    console.log(c.dim(`  ${path} -> statusLine.command = ${command}`))
    return
  }

  settings.statusLine = { type: 'command', command, padding: 0 }
  const next = `${JSON.stringify(settings, null, 2)}\n`

  if (opts.dryRun) {
    console.log(c.dim(`would write ${path}:`))
    console.log(next)
    return
  }

  mkdirSync(dirname(path), { recursive: true })
  if (existsSync(path)) {
    const backup = `${path}.nnt-backup`
    copyFileSync(path, backup)
    console.log(c.dim(`backed up ${path} -> ${backup}`))
  }
  writeFileSync(path, next, 'utf8')

  console.log(c.green('Status line wired up.'))
  console.log(c.dim(`  ${path} -> statusLine.command = ${command}`))
  console.log()
  console.log('Restart Claude Code, then run `nnt serve` to open the dashboard.')
  console.log(c.dim('Limits and live updates only start flowing once the hook has fired once.'))
}
