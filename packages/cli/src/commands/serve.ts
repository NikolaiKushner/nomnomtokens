import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultDbPath } from '@nomnomtokens/db'
import { c, MASCOT } from '../format.js'
import { scan } from './scan.js'

export interface ServeOptions {
  port?: number
  db?: string
  open?: boolean
  /** skip the catch-up scan before starting */
  noScan?: boolean
}

const here = dirname(fileURLToPath(import.meta.url))

/**
 * Locate the built Nuxt server.
 *
 * Three layouts have to work: the published package (`web/` shipped next to
 * `dist/`), the workspace running from source via tsx, and the workspace
 * running from `dist/`. Rather than count `..` segments per layout — which is
 * how this broke the first time — walk up and look for either shape.
 */
function findBuiltServer(): string | null {
  let dir = here
  for (let depth = 0; depth < 8; depth++) {
    const candidates = [
      join(dir, 'web', 'server', 'index.mjs'),
      join(dir, 'apps', 'web', '.output', 'server', 'index.mjs'),
    ]
    const found = candidates.find(existsSync)
    if (found) return found

    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
}

export async function serve(opts: ServeOptions = {}): Promise<void> {
  const port = opts.port ?? 4269
  const dbPath = opts.db ?? defaultDbPath()

  // Catch up on history before the browser opens, so the first paint has data
  // in it rather than an empty state that fills in a second later.
  if (!opts.noScan) {
    console.log(c.dim('catching up on history…'))
    await scan({ db: dbPath, quiet: true })
    // Having nothing to scan is a failure for `nnt scan` but not for `serve`:
    // a first-run machine with no agent history should still get a dashboard
    // and its empty state, and should still exit 0 when you close it.
    process.exitCode = undefined
  }

  const entry = findBuiltServer()
  if (!entry) {
    console.error(c.yellow('No built dashboard found.'))
    console.error(c.dim('In this repo, run:  pnpm --filter @nomnomtokens/web build'))
    console.error(c.dim('or for live reload:  pnpm dev'))
    process.exitCode = 1
    return
  }

  const url = `http://localhost:${port}`
  console.log(MASCOT)
  console.log(`  ${c.bold('nomnomtokens')} ${c.dim('→')} ${c.cyan(url)}`)
  console.log(c.dim(`  reading ${dbPath}`))
  console.log()

  const child = spawn(process.execPath, [entry], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      NITRO_PORT: String(port),
      NOMNOMTOKENS_DB: dbPath,
    },
  })

  if (opts.open !== false) setTimeout(() => openBrowser(url), 600)

  await new Promise<void>((resolvePromise) => {
    child.on('exit', () => resolvePromise())
    process.on('SIGINT', () => child.kill('SIGINT'))
  })
}
