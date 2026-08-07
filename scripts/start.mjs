#!/usr/bin/env node
/**
 * One-command local launch: build the dashboard if missing, then scan + serve.
 *
 *   pnpm start
 */
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const built = [
  join(root, 'web', 'server', 'index.mjs'),
  join(root, 'apps', 'web', '.output', 'server', 'index.mjs'),
].some(existsSync)

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!built) {
  console.log('no built dashboard yet — running pnpm build once…')
  run('pnpm', ['build'])
}

run('pnpm', ['nnt'])
