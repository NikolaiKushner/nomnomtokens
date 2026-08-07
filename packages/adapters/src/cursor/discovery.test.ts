import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { IngestRecord, ScanCursor, ScanState } from '@nomnomtokens/core'
import { CursorAdapter } from './index.js'

function memoryState(): ScanState {
  const map = new Map<string, ScanCursor>()
  return {
    get: (p) => map.get(p),
    set: (c) => {
      map.set(c.sourcePath, c)
    },
  }
}

async function collect(adapter: CursorAdapter, state: ScanState): Promise<IngestRecord[]> {
  const out: IngestRecord[] = []
  for await (const r of adapter.scan(state)) out.push(r)
  return out
}

function buildFixture(): { userDataDir: string, stateDbPath: string } {
  const root = join(tmpdir(), `nnt-cursor-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const globalStorage = join(root, 'User', 'globalStorage')
  const workspaceStorage = join(root, 'User', 'workspaceStorage')
  const wsId = 'ws-fixture-1'
  mkdirSync(globalStorage, { recursive: true })
  mkdirSync(join(workspaceStorage, wsId), { recursive: true })

  writeFileSync(
    join(workspaceStorage, wsId, 'workspace.json'),
    JSON.stringify({ folder: 'file:///Users/me/dev/fixture-app' }),
  )

  const stateDbPath = join(globalStorage, 'state.vscdb')
  const db = new Database(stateDbPath)
  db.exec(`
    CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB);
    CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);
  `)

  const headers = {
    allComposers: [
      {
        composerId: 'comp-a',
        totalLinesAdded: 4,
        totalLinesRemoved: 1,
        workspaceIdentifier: {
          id: wsId,
          uri: { external: 'file:///Users/me/dev/fixture-app' },
        },
      },
    ],
  }
  db.prepare(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`).run(
    'composer.composerHeaders',
    JSON.stringify(headers),
  )

  db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
    'composerData:comp-a',
    JSON.stringify({
      composerId: 'comp-a',
      modelConfig: { modelName: 'claude-sonnet-4-5' },
      totalLinesAdded: 4,
      totalLinesRemoved: 1,
    }),
  )

  db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
    'bubbleId:comp-a:bubble-1',
    JSON.stringify({
      bubbleId: 'bubble-1',
      type: 2,
      createdAt: '2026-02-01T10:00:00.000Z',
      tokenCount: { inputTokens: 500, outputTokens: 100 },
      // Intentionally include content fields — the adapter must not leak them.
      text: 'SECRET_PROMPT_SHOULD_NOT_LEAK',
      richText: '/Users/me/dev/fixture-app/secret.ts',
    }),
  )

  db.prepare(`INSERT INTO cursorDiskKV (key, value) VALUES (?, ?)`).run(
    'bubbleId:comp-a:bubble-empty',
    JSON.stringify({
      bubbleId: 'bubble-empty',
      type: 2,
      createdAt: '2026-02-01T10:01:00.000Z',
      tokenCount: { inputTokens: 0, outputTokens: 0 },
      text: 'ignored',
    }),
  )

  db.close()
  return { userDataDir: root, stateDbPath }
}

describe('CursorAdapter', () => {
  it('detects a present state.vscdb', async () => {
    const { userDataDir } = buildFixture()
    const adapter = new CursorAdapter({ userDataDir })
    expect(await adapter.detect()).toBe(true)
  })

  it('scans spend events and scopes without leaking content', async () => {
    const { userDataDir } = buildFixture()
    const adapter = new CursorAdapter({ userDataDir })
    const records = await collect(adapter, memoryState())

    const events = records.flatMap(r => (r.type === 'event' ? [r.event] : []))
    const scopes = records.flatMap(r => (r.type === 'scope' ? [r] : []))

    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe('cursor:comp-a:bubble-1')
    expect(events[0]!.qty).toMatchObject({ in: 500, out: 100 })
    expect(events[0]!.meta).toEqual({ linesAdded: 4, linesRemoved: 1 })

    expect(scopes).toHaveLength(1)
    expect(scopes[0]!.label).toBe('fixture-app')

    const blob = JSON.stringify(records)
    expect(blob).not.toContain('SECRET_PROMPT')
    expect(blob).not.toContain('secret.ts')
    expect(blob).not.toContain('/Users/me/dev/fixture-app')
  })

  it('skips an unchanged db on the second scan', async () => {
    const { userDataDir } = buildFixture()
    const adapter = new CursorAdapter({ userDataDir })
    const state = memoryState()
    const first = await collect(adapter, state)
    expect(first.length).toBeGreaterThan(0)
    expect(await collect(adapter, state)).toHaveLength(0)
  })
})
