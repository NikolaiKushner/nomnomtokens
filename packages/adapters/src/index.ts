import type { Adapter, PriceTable } from '@nomnomtokens/core'
import { ClaudeCodeAdapter } from './claude-code/index.js'
import { CodexAdapter } from './codex/index.js'
import { CursorAdapter } from './cursor/index.js'

export * from './claude-code/index.js'
export * from './codex/index.js'
export * from './cursor/index.js'
export * from './csv/index.js'

export interface AdapterRegistryOptions {
  prices?: PriceTable
}

/**
 * The adapter registry.
 *
 * Adding a source is: a new directory under src/, one line here. If a new
 * adapter ever needs a change in core or the UI, the contract was designed
 * wrong — fix the contract, not the adapter. See docs/adapters.md.
 */
export function allAdapters(opts: AdapterRegistryOptions = {}): Adapter[] {
  const prices = opts.prices
  return [
    new ClaudeCodeAdapter({ prices }),
    new CursorAdapter({ prices }),
    new CodexAdapter({ prices }),
  ]
}

export async function detectAdapters(opts: AdapterRegistryOptions = {}): Promise<Adapter[]> {
  const found: Adapter[] = []
  for (const adapter of allAdapters(opts)) {
    if (await adapter.detect()) found.push(adapter)
  }
  return found
}
