import { describe, expect, it } from 'vitest'
import type { SpendEvent } from '@nomnomtokens/core'
import { openDb } from './client.js'
import { Queries } from './queries.js'
import { Repo } from './repo.js'

function event(over: Partial<SpendEvent> = {}): SpendEvent {
  return {
    id: 'e1',
    ts: Date.parse('2026-03-04T12:00:00'),
    provider: 'claude-code',
    kind: 'tokens',
    sessionId: 's1',
    scopeHash: 'aaaa',
    unitLabel: 'claude-opus-5',
    qty: { in: 10, out: 5, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 85 },
    costUsd: 1,
    meta: { linesAdded: 10, linesRemoved: 2 },
    ...over,
  }
}

function fresh() {
  const { sqlite } = openDb(':memory:')
  return { sqlite, repo: new Repo(sqlite), q: new Queries(sqlite) }
}

describe('ingest', () => {
  it('is idempotent — re-ingesting the same events changes nothing', () => {
    const { repo, q } = fresh()
    const records = [{ type: 'event' as const, event: event() }]
    repo.ingest(records)
    const first = q.totals()
    repo.ingest(records)
    repo.ingest(records)
    expect(q.totals()).toEqual(first)
    expect(q.bounds().events).toBe(1)
  })

  it('lets a fuller record replace a streaming partial', () => {
    const { repo, q } = fresh()
    repo.ingest([{ type: 'event', event: event({ qty: { in: 2, out: 1 }, costUsd: 0.1 }) }])
    repo.ingest([{ type: 'event', event: event({ qty: { in: 2, out: 500 }, costUsd: 0.9 }) }])
    expect(q.totals().qtyOut).toBe(500)
    expect(q.totals().costUsd).toBeCloseTo(0.9)
  })

  it('does not let a partial clobber the final counts', () => {
    const { repo, q } = fresh()
    repo.ingest([{ type: 'event', event: event({ qty: { in: 2, out: 500 } }) }])
    repo.ingest([{ type: 'event', event: event({ qty: { in: 0, out: 0 } }) }])
    expect(q.totals().qtyOut).toBe(500)
  })

  it('reports duplicates separately from new rows', () => {
    const { repo } = fresh()
    const r1 = repo.ingest([{ type: 'event', event: event() }])
    expect(r1.events).toBe(1)
    const r2 = repo.ingest([{ type: 'event', event: event({ qty: { in: 0, out: 0 } }) }])
    expect(r2.duplicates).toBe(1)
  })
})

describe('queries', () => {
  it('separates kinds so tokens never add up with sessions', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'event', event: event({ id: 'a', kind: 'tokens', costUsd: 1 }) },
      { type: 'event', event: event({ id: 'b', kind: 'session', costUsd: 99, qty: { sessions: 1 } }) },
    ])
    expect(q.totals({ kind: 'tokens' }).costUsd).toBe(1)
    expect(q.totals({ kind: 'session' }).costUsd).toBe(99)
  })

  it('flags unpriced events instead of counting them as free', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'event', event: event({ id: 'a', costUsd: 2 }) },
      { type: 'event', event: event({ id: 'b', costUsd: null }) },
    ])
    const t = q.totals()
    expect(t.costUsd).toBe(2)
    expect(t.unpricedEvents).toBe(1)
  })

  it('filters by range, scope and provider', () => {
    const { repo, q } = fresh()
    const base = Date.parse('2026-03-04T12:00:00')
    repo.ingest([
      { type: 'event', event: event({ id: 'a', ts: base, scopeHash: 'x', provider: 'claude-code' }) },
      { type: 'event', event: event({ id: 'b', ts: base + 86_400_000, scopeHash: 'y', provider: 'csv' }) },
    ])
    expect(q.totals({ from: base, to: base + 1 }).events).toBe(1)
    expect(q.totals({ scopeHash: ['y'] }).events).toBe(1)
    expect(q.totals({ provider: ['csv'] }).events).toBe(1)
    expect(q.totals({ provider: ['csv', 'claude-code'] }).events).toBe(2)
  })

  it('groups a series by model', () => {
    const { repo, q } = fresh()
    const base = Date.parse('2026-03-04T12:00:00')
    repo.ingest([
      { type: 'event', event: event({ id: 'a', ts: base, unitLabel: 'claude-opus-5' }) },
      { type: 'event', event: event({ id: 'b', ts: base, unitLabel: 'claude-haiku-4-5' }) },
    ])
    const rows = q.series('day', {}, 'unitLabel')
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.group).sort()).toEqual(['claude-haiku-4-5', 'claude-opus-5'])
    expect(new Set(rows.map(r => r.bucket)).size).toBe(1)
  })

  it('joins scope labels for the projects table', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'scope', scopeHash: 'aaaa', label: 'client-x', provider: 'claude-code' },
      { type: 'event', event: event() },
    ])
    expect(q.byScope()[0]).toMatchObject({ scopeHash: 'aaaa', label: 'client-x' })
  })

  it('keeps limit snapshots in chronological order', () => {
    const { repo, q } = fresh()
    const base = Date.now()
    repo.ingest([
      { type: 'limit', limit: { ts: base + 1000, provider: 'claude-code', window: '5h', usedPct: 20, resetsAt: null } },
      { type: 'limit', limit: { ts: base, provider: 'claude-code', window: '5h', usedPct: 10, resetsAt: null } },
    ])
    expect(q.limitSnapshots().map(s => s.usedPct)).toEqual([10, 20])
    expect(q.limitWindows()).toEqual([{ provider: 'claude-code', window: '5h' }])
  })

  it('tracks scan cursors so a rescan can skip untouched files', () => {
    const { repo } = fresh()
    const state = repo.scanState()
    expect(state.get('/a.jsonl')).toBeUndefined()
    state.set({ sourcePath: '/a.jsonl', mtime: 1, size: 2, offset: 3 })
    expect(state.get('/a.jsonl')).toEqual({ sourcePath: '/a.jsonl', mtime: 1, size: 2, offset: 3 })
  })

  it('repairs Cursor Auto placeholder labels into null', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'event', event: event({ id: 'd1', unitLabel: 'default,default,default,default', costUsd: null }) },
      { type: 'event', event: event({ id: 'd2', unitLabel: 'default', costUsd: null }) },
      { type: 'event', event: event({ id: 'ok', unitLabel: 'grok-4.5', costUsd: 1 }) },
    ])
    expect(repo.repairPlaceholderLabels()).toBe(2)
    const labels = q.byUnitLabel().map(r => r.unitLabel)
    expect(labels).toContain(null)
    expect(labels).toContain('grok-4.5')
    expect(labels).not.toContain('default')
    expect(labels).not.toContain('default,default,default,default')
  })
})
