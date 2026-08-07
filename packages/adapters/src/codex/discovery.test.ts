import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { IngestRecord, ScanCursor, ScanState } from '@nomnomtokens/core'
import { CodexAdapter } from './index.js'

function memoryState(): ScanState {
  const map = new Map<string, ScanCursor>()
  return {
    get: p => map.get(p),
    set: c => {
      map.set(c.sourcePath, c)
    },
  }
}

async function collect(adapter: CodexAdapter, state: ScanState): Promise<IngestRecord[]> {
  const out: IngestRecord[] = []
  for await (const r of adapter.scan(state)) out.push(r)
  return out
}

function fixtureHome(): string {
  const home = join(tmpdir(), `nnt-codex-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const sessions = join(home, 'sessions', '2026', '08', '07')
  mkdirSync(sessions, { recursive: true })

  const rows = [
    {
      timestamp: '2026-08-07T11:00:00.000Z',
      type: 'session_meta',
      payload: { session_id: 'sess-fix', cwd: '/Users/me/dev/fixture-app' },
    },
    {
      timestamp: '2026-08-07T11:00:01.000Z',
      type: 'turn_context',
      payload: { model: 'gpt-5.6-terra', cwd: '/Users/me/dev/fixture-app' },
    },
    {
      timestamp: '2026-08-07T11:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 500,
            cached_input_tokens: 100,
            output_tokens: 20,
            total_tokens: 520,
          },
          last_token_usage: {
            input_tokens: 500,
            cached_input_tokens: 100,
            output_tokens: 20,
            total_tokens: 520,
          },
        },
        rate_limits: {
          primary: { used_percent: 2, window_minutes: 43200, resets_at: 1780000000 },
        },
      },
    },
  ]
  writeFileSync(
    join(sessions, 'rollout-2026-08-07T11-00-00-sess-fix.jsonl'),
    rows.map(r => JSON.stringify(r)).join('\n') + '\n',
  )
  return home
}

describe('CodexAdapter', () => {
  it('detects a CODEX_HOME with sessions', async () => {
    const home = fixtureHome()
    const adapter = new CodexAdapter({ home })
    expect(await adapter.detect()).toBe(true)
  })

  it('scans rollouts once, then no-ops on an unchanged file', async () => {
    const home = fixtureHome()
    const adapter = new CodexAdapter({ home })
    const state = memoryState()

    const first = await collect(adapter, state)
    expect(first.some(r => r.type === 'scope')).toBe(true)
    expect(first.filter(r => r.type === 'event')).toHaveLength(1)
    expect(first.filter(r => r.type === 'limit')).toHaveLength(1)

    const scope = first.find(r => r.type === 'scope')
    expect(scope?.type === 'scope' && scope.label).toBe('fixture-app')

    const second = await collect(adapter, state)
    expect(second).toHaveLength(0)
  })
})
