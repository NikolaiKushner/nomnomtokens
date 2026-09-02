import { describe, expect, it } from 'vitest'
import { costOf, resolveModelKey } from './pricing.js'
import { currentWindowSnapshots, forecastLimit, linearRegression, moodFor } from './forecast.js'
import { bucketStart, cacheHitRate, costPerKLines, heatmap, timeSeries } from './aggregate.js'
import { formatExportCsv, formatExportJson } from './export-format.js'
import { evaluateAlerts, parseAlertsConfig } from './alerts.js'
import { parsePricesFile, serializePricesFile } from './prices-file.js'
import { scopeHash, scopeLabel } from './hash.js'
import type { LimitSnapshot, SpendEvent } from './types.js'
import { totalTokens } from './types.js'

describe('resolveModelKey', () => {
  it('strips date snapshots and provider prefixes', () => {
    expect(resolveModelKey('claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5')
    expect(resolveModelKey('anthropic.claude-opus-5')).toBe('claude-opus-5')
    expect(resolveModelKey('claude-opus-5-fast')).toBe('claude-opus-5')
  })
  it('refuses to price synthetic or unknown models', () => {
    expect(resolveModelKey('<synthetic>')).toBeNull()
    expect(resolveModelKey(null)).toBeNull()
    expect(resolveModelKey('gpt-4')).toBeNull()
    expect(resolveModelKey('composer-2.5')).toBeNull()
    expect(resolveModelKey('default')).toBeNull()
    expect(resolveModelKey('default,default,default,default')).toBeNull()
  })
  it('normalises Cursor-style Claude ids', () => {
    expect(resolveModelKey('claude-4.5-sonnet-thinking')).toBe('claude-sonnet-4-5')
    expect(resolveModelKey('claude-4.6-opus-high-thinking')).toBe('claude-opus-4-6')
  })
  it('resolves Codex GPT-5.6 family ids', () => {
    expect(resolveModelKey('gpt-5.6-terra')).toBe('gpt-5-6-terra')
    expect(resolveModelKey('gpt-5.6-luna')).toBe('gpt-5-6-luna')
  })
})

describe('costOf', () => {
  it('applies the cache multipliers', () => {
    // opus-5: $5/1M in, $25/1M out; writes 1.25x/2x, reads 0.1x of input
    const cost = costOf('claude-opus-5', {
      in: 1_000_000,
      out: 1_000_000,
      cacheCreate: 1_000_000,
      cacheCreate1h: 1_000_000,
      cacheRead: 1_000_000,
    })
    expect(cost).toBeCloseTo(5 + 25 + 6.25 + 10 + 0.5, 10)
  })
  it('returns null rather than zero for an unpriceable model', () => {
    expect(costOf('who-knows', { in: 1000 })).toBeNull()
  })

  it('prices synthetic messages at exactly zero, not unknown', () => {
    // no API call happened — that is a different claim from "no price found"
    expect(costOf('<synthetic>', { in: 1000, out: 10 })).toBe(0)
  })
})

describe('scope hashing', () => {
  it('is stable, 16 hex chars, and reveals nothing', async () => {
    const a = await scopeHash('/Users/me/dev/secret-client-project')
    const b = await scopeHash('/Users/me/dev/secret-client-project')
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(a).not.toContain('secret')
  })
  it('derives a local-only label from the last path segment', () => {
    expect(scopeLabel('/Users/me/dev/app/')).toBe('app')
    expect(scopeLabel('C:\\work\\thing')).toBe('thing')
  })
})

function event(over: Partial<SpendEvent> = {}): SpendEvent {
  return {
    id: 'e',
    ts: Date.parse('2026-03-04T12:00:00'),
    provider: 'claude-code',
    kind: 'tokens',
    sessionId: 's1',
    scopeHash: 'abc',
    unitLabel: 'claude-opus-5',
    qty: { in: 10, out: 5, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 90 },
    costUsd: 1,
    meta: {},
    ...over,
  }
}

describe('aggregation', () => {
  it('buckets in local time, not UTC', () => {
    const ts = Date.parse('2026-03-04T23:30:00')
    const day = new Date(bucketStart(ts, 'day'))
    expect(day.getHours()).toBe(0)
    expect(day.getDate()).toBe(4)
  })

  it('starts weeks on Monday', () => {
    // 2026-03-04 is a Wednesday
    const week = new Date(bucketStart(Date.parse('2026-03-04T12:00:00'), 'week'))
    expect(week.getDay()).toBe(1)
  })

  it('marks totals incomplete when any event is unpriced', () => {
    const points = timeSeries([event(), event({ id: 'e2', costUsd: null })], 'day')
    expect(points).toHaveLength(1)
    expect(points[0]!.totals.costComplete).toBe(false)
    expect(points[0]!.totals.events).toBe(2)
    expect(points[0]!.totals.sessions).toBe(1)
  })

  it('computes cache hit rate as read / (read + fresh)', () => {
    expect(cacheHitRate({ cacheRead: 90, in: 10 })).toBeCloseTo(0.9)
    expect(cacheHitRate({ cacheRead: 0, in: 0 })).toBeNull()
  })

  it('computes cost per 1k changed lines', () => {
    expect(costPerKLines(4, { linesAdded: 150, linesRemoved: 50 })).toBe(20)
    expect(costPerKLines(4, {})).toBeNull()
  })

  it('produces a full 7x24 heatmap grid', () => {
    const cells = heatmap([event()])
    expect(cells).toHaveLength(168)
    expect(cells.reduce((s, c) => s + c.value, 0)).toBe(1)
  })

  it('sums every token bucket', () => {
    expect(totalTokens({ in: 1, out: 2, cacheCreate: 3, cacheCreate1h: 4, cacheRead: 5 })).toBe(15)
  })
})

describe('forecasting', () => {
  it('fits a line', () => {
    const fit = linearRegression([{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }])
    expect(fit!.slope).toBeCloseTo(2)
    expect(fit!.intercept).toBeCloseTo(0)
  })

  it('projects when a window fills', () => {
    const base = Date.parse('2026-03-04T00:00:00')
    const snaps: LimitSnapshot[] = [0, 1, 2].map(h => ({
      ts: base + h * 3_600_000,
      provider: 'claude-code',
      window: '5h',
      usedPct: 10 + h * 10,
      resetsAt: base + 5 * 3_600_000,
    }))
    const f = forecastLimit(snaps, base + 2 * 3_600_000)!
    expect(f.burnRatePctPerHour).toBeCloseTo(10)
    // 30% used, 10%/h -> 7 hours to full, which is past the 5h reset
    expect(f.exhaustsAt).toBeCloseTo(base + 9 * 3_600_000, -3)
    expect(f.willExhaustBeforeReset).toBe(false)
  })

  it('regresses only over the current window, not across a reset', () => {
    // A reset makes usedPct fall off a cliff. Fitting across it yields a
    // negative burn rate and a confidently wrong "you will never hit the cap".
    const base = Date.parse('2026-03-04T00:00:00')
    const snaps: LimitSnapshot[] = [
      { ts: base, provider: 'p', window: '5h', usedPct: 80, resetsAt: null },
      { ts: base + 3_600_000, provider: 'p', window: '5h', usedPct: 95, resetsAt: null },
      { ts: base + 2 * 3_600_000, provider: 'p', window: '5h', usedPct: 5, resetsAt: null },
      { ts: base + 3 * 3_600_000, provider: 'p', window: '5h', usedPct: 15, resetsAt: null },
    ]
    expect(currentWindowSnapshots(snaps).map(s => s.usedPct)).toEqual([5, 15])
    const f = forecastLimit(snaps, base + 3 * 3_600_000)!
    expect(f.samples).toBe(2)
    expect(f.burnRatePctPerHour).toBeGreaterThan(0)
  })

  it('reports no exhaustion when usage is flat', () => {
    const base = Date.now()
    const snaps: LimitSnapshot[] = [0, 1].map(h => ({
      ts: base + h * 3_600_000,
      provider: 'p',
      window: '7d',
      usedPct: 42,
      resetsAt: null,
    }))
    expect(forecastLimit(snaps)!.exhaustsAt).toBeNull()
  })

  it('maps fullness to a mascot mood', () => {
    expect(moodFor(0)).toBe('hungry')
    expect(moodFor(30)).toBe('content')
    expect(moodFor(85)).toBe('stuffed')
    expect(moodFor(100)).toBe('overstuffed')
  })
})

describe('export format', () => {
  const row = {
    id: 'e1',
    ts: Date.UTC(2026, 0, 2, 12),
    provider: 'claude-code',
    kind: 'tokens',
    sessionId: 's1',
    scopeHash: 'abcd',
    project: 'demo,project',
    client: null,
    model: 'claude-sonnet-4-5',
    costUsd: 1.5,
    tokens: 1000,
    qtyIn: 800,
    qtyOut: 200,
    qtyCacheCreate: 0,
    qtyCacheCreate1h: 0,
    qtyCacheRead: 100,
  }

  it('escapes CSV cells that contain commas', () => {
    const csv = formatExportCsv([row])
    expect(csv).toContain('"demo,project"')
    expect(csv.split('\n')[0]).toContain('timestamp')
  })

  it('emits JSON with ISO timestamps', () => {
    const parsed = JSON.parse(formatExportJson([row])) as Array<{ timestamp: string, costUsd: number }>
    const first = parsed[0]
    expect(first).toBeDefined()
    expect(first!.timestamp).toBe('2026-01-02T12:00:00.000Z')
    expect(first!.costUsd).toBe(1.5)
  })
})

describe('prices file', () => {
  it('accepts a bare model map or a wrapped { models } object', () => {
    const bare = parsePricesFile('{"claude-sonnet-4-5":{"input":3,"output":15}}')
    expect(bare.models['claude-sonnet-4-5']?.input).toBe(3)

    const wrapped = parsePricesFile(serializePricesFile({
      updatedAt: '2026-01-01T00:00:00.000Z',
      source: 'test',
      models: { 'claude-opus-4-6': { input: 5, output: 25 } },
    }))
    expect(wrapped.source).toBe('test')
    expect(wrapped.models['claude-opus-4-6']?.output).toBe(25)
  })
})

describe('alerts', () => {
  it('fires limit and daily thresholds independently', () => {
    const config = parseAlertsConfig({ limitPct: 80, dailyUsd: 10 })
    const hits = evaluateAlerts(config, {
      todayCostUsd: 12,
      limits: [
        { provider: 'claude-code', window: '5h', usedPct: 90 },
        { provider: 'claude-code', window: '7d', usedPct: 40 },
      ],
    })
    expect(hits.map(h => h.kind).sort()).toEqual(['daily', 'limit'])
    expect(hits.find(h => h.kind === 'limit')?.window).toBe('5h')
  })

  it('treats null thresholds as off', () => {
    const hits = evaluateAlerts(parseAlertsConfig({ limitPct: null, dailyUsd: null }), {
      todayCostUsd: 999,
      limits: [{ provider: 'x', window: '5h', usedPct: 99 }],
    })
    expect(hits).toHaveLength(0)
  })
})
