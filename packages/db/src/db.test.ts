import { describe, expect, it } from 'vitest'
import type { SpendEvent } from '@nomnomtokens/core'
import { COLD_GAP_MS, formatNntArchive, parseNntArchive } from '@nomnomtokens/core'
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

  it('aggregates sidechain spend separately from parent turns', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'event', event: event({ id: 'p1', costUsd: 2, meta: { linesAdded: 1 } }) },
      { type: 'event', event: event({ id: 'p2', costUsd: 3, meta: { linesAdded: 1 } }) },
      {
        type: 'event',
        event: event({
          id: 's1',
          costUsd: 5,
          meta: { sidechain: 1, linesAdded: 1 },
          qty: { in: 100, out: 50, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 0 },
        }),
      },
    ])
    const sc = q.sidechainTotals({ kind: 'tokens' })
    expect(sc.taggedEvents).toBe(1)
    expect(sc.costUsd).toBe(5)
    expect(sc.events).toBe(1)
    expect(q.totals({ kind: 'tokens' }).costUsd).toBe(10)
  })

  it('reports zero taggedEvents when no sidechain meta is present', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'event', event: event({ id: 'a', provider: 'codex', costUsd: 1 }) },
      { type: 'event', event: event({ id: 'b', provider: 'cursor', costUsd: 2 }) },
    ])
    const sc = q.sidechainTotals()
    expect(sc.taggedEvents).toBe(0)
    expect(sc.costUsd).toBe(0)
    expect(sc.events).toBe(0)
  })

  it('ranks sessions for audit with sidechain cost share', () => {
    const { repo, q } = fresh()
    repo.ingest([
      { type: 'scope', scopeHash: 'aaaa', label: 'hot-repo', provider: 'claude-code' },
      { type: 'event', event: event({ id: 'a', sessionId: 'sess-a', costUsd: 10, meta: {} }) },
      {
        type: 'event',
        event: event({
          id: 'b',
          sessionId: 'sess-a',
          costUsd: 10,
          meta: { sidechain: 1 },
        }),
      },
      { type: 'event', event: event({ id: 'c', sessionId: 'sess-b', costUsd: 1, meta: {} }) },
    ])
    const rows = q.sessionsAudit({ kind: 'tokens' }, 5)
    expect(rows[0]).toMatchObject({
      sessionId: 'sess-a',
      label: 'hot-repo',
      costUsd: 20,
      sidechainCostUsd: 10,
      sidechainTagged: 1,
    })
    expect(rows[1]?.sessionId).toBe('sess-b')
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

  it('keeps a locked scope label across ingest', () => {
    const { repo, q } = fresh()
    repo.ingest([{ type: 'scope', scopeHash: 'aaaa', label: 'folder-name', provider: 'claude-code' }])
    expect(repo.updateScope('aaaa', { label: 'acme', client: 'Acme Inc' })).toBe(true)
    repo.ingest([{ type: 'scope', scopeHash: 'aaaa', label: 'folder-name', provider: 'claude-code' }])
    const row = q.scopeLabels().find(s => s.scopeHash === 'aaaa')
    expect(row).toMatchObject({ label: 'acme', client: 'Acme Inc', labelLocked: true })
  })

  it('surfaces a cold resume from sessionEvents', () => {
    const { repo, q } = fresh()
    const t0 = Date.parse('2026-08-01T10:00:00Z')
    repo.ingest([
      { type: 'scope', scopeHash: 'aaaa', label: 'hot-repo', provider: 'claude-code' },
      {
        type: 'event',
        event: event({
          id: 'c1',
          ts: t0,
          qty: { in: 100, out: 20, cacheCreate: 3_000, cacheCreate1h: 0, cacheRead: 0 },
          costUsd: 0.2,
        }),
      },
      {
        type: 'event',
        event: event({
          id: 'c2',
          ts: t0 + COLD_GAP_MS + 60_000,
          qty: { in: 100, out: 20, cacheCreate: 80_000, cacheCreate1h: 0, cacheRead: 0 },
          costUsd: 4.2,
        }),
      },
    ])
    const hits = q.coldResumesFor([{ sessionId: 's1', label: 'hot-repo' }])
    expect(hits).toHaveLength(1)
    expect(hits[0]?.costUsd).toBe(4.2)
  })

  it('round-trips an nnt archive without doubling events', () => {
    const { repo, q } = fresh()
    const base = Date.parse('2026-03-04T12:00:00')
    repo.ingest([
      { type: 'scope', scopeHash: 'aaaa', label: 'demo', provider: 'claude-code' },
      { type: 'event', event: event({ ts: base }) },
      {
        type: 'limit',
        limit: { ts: base, provider: 'claude-code', window: '7d', usedPct: 40, resetsAt: base + 1 },
      },
    ])
    const json = formatNntArchive({
      version: 1,
      events: q.exportSpendEvents(),
      limits: q.limitSnapshots(),
      scopes: q.scopeLabels().map(s => ({
        scopeHash: s.scopeHash,
        label: s.label,
        provider: s.provider,
        lastSeen: s.lastSeen,
        client: s.client,
        labelLocked: s.labelLocked,
      })),
    })
    const { repo: repo2, q: q2 } = fresh()
    repo2.ingest(parseNntArchive(json))
    expect(q2.bounds().events).toBe(1)
    expect(q2.totals().costUsd).toBe(q.totals().costUsd)
    expect(q2.limitWindows()).toEqual([{ provider: 'claude-code', window: '7d' }])
    repo2.ingest(parseNntArchive(json))
    expect(q2.bounds().events).toBe(1)
  })

  it('returns the latest limit per provider/window', () => {
    const { repo, q } = fresh()
    const t = Date.now()
    repo.ingest([
      { type: 'limit', limit: { ts: t, provider: 'codex', window: '7d', usedPct: 10, resetsAt: null } },
      { type: 'limit', limit: { ts: t + 1, provider: 'codex', window: '7d', usedPct: 12, resetsAt: null } },
      { type: 'limit', limit: { ts: t, provider: 'claude-code', window: '7d', usedPct: 80, resetsAt: null } },
    ])
    const latest = q.latestLimits()
    expect(latest.find(l => l.provider === 'codex' && l.window === '7d')?.usedPct).toBe(12)
    expect(latest.find(l => l.provider === 'claude-code')?.usedPct).toBe(80)
  })
})
