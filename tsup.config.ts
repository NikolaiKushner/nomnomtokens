import { defineConfig } from 'tsup'

/**
 * Bundle the CLI for publishing.
 *
 * The workspace packages are `private: true` and will never exist on npm, so
 * they must be **inlined** into the bundle rather than left as imports — a
 * published `import '@nomnomtokens/core'` would fail to resolve on the user's
 * machine. Everything under the scope is therefore `noExternal`.
 *
 * The three real runtime dependencies stay external and are declared in the
 * root package.json: better-sqlite3 because it is a native module that must be
 * built or prebuilt for the user's platform, chokidar and commander because
 * bundling them buys nothing.
 */
export default defineConfig({
  entry: { index: 'packages/cli/src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  sourcemap: true,
  treeshake: true,
  noExternal: [/^@nomnomtokens\//],
  external: ['better-sqlite3', 'chokidar', 'commander'],
})
