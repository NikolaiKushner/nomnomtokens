#!/usr/bin/env node
import { cp, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Stage the built Nuxt server into the publishable tree.
 *
 * `apps/web/.output` is a workspace path that does not survive `npm pack` — the
 * tarball only contains what `files` lists, and a dot-directory inside another
 * package is not reachable. Copying it to `web/` at the package root makes it a
 * first-class published artefact, and matches the layout `serve` looks for.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'apps', 'web', '.output')
const target = join(root, 'web')

const built = await stat(join(source, 'server', 'index.mjs')).catch(() => null)
if (!built) {
  console.error('No Nuxt build found at apps/web/.output.')
  console.error('Run `pnpm --filter @nomnomtokens/web build` first.')
  process.exit(1)
}

await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })

console.log(`dashboard staged: ${source} -> ${target}`)
