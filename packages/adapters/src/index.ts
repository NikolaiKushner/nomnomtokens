import type { Adapter } from '@nomnomtokens/core'
import { ClaudeCodeAdapter } from './claude-code/index.js'

export * from './claude-code/index.js'
export * from './csv/index.js'

/**
 * The adapter registry.
 *
 * Adding a source is: a new directory under src/, one line here. If a new
 * adapter ever needs a change in core or the UI, the contract was designed
 * wrong — fix the contract, not the adapter. See docs/adapters.md.
 */
export function allAdapters(): Adapter[] {
  return [new ClaudeCodeAdapter()]
}

export async function detectAdapters(): Promise<Adapter[]> {
  const found: Adapter[] = []
  for (const adapter of allAdapters()) {
    if (await adapter.detect()) found.push(adapter)
  }
  return found
}
