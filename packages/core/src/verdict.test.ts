import { describe, expect, it } from 'vitest'
import type { LimitSnapshot } from './types.js'
import { buildVerdict } from './verdict.js'

const NOW = Date.parse('2026-09-02T12:00:00Z')
const WEEK = 7 * 24 * 3_600_000

function snaps(
  window: '5h' | '7d',
  points: Array<{ ts: number, usedPct: number, resetsAt?: number | null }>,
): LimitSnapshot[] {
  return points.map(p => ({
    ts: p.ts,
    provider: 'claude-code',
    window,
    usedPct: p.usedPct,
    resetsAt: p.resetsAt === undefined ? NOW + WEEK / 2 : p.resetsAt,
  }))
}

describe('buildVerdict', () => {
  it('returns unknown when there are no 7d snapshots', () => {
    const v = buildVerdict({
      weekly: [],
      fiveHour: snaps('5h', [{ ts: NOW - 3_600_000, usedPct: 90 }]),
      weeklyCostUsd: 12,
      now: NOW,
    })
    expect(v.recommended).toBe('unknown')
    expect(v.weeklyBound).toBe(false)
    expect(v.caveats.length).toBeGreaterThan(0)
  })

  it('marks weekly-bound fill and prefers two 5x over one 20x', () => {
    const v = buildVerdict({
      weekly: snaps('7d', [
        { ts: NOW - WEEK * 0.1, usedPct: 10, resetsAt: NOW + WEEK * 0.9 },
        { ts: NOW, usedPct: 88, resetsAt: NOW + WEEK * 0.9 },
      ]),
      fiveHour: snaps('5h', [{ ts: NOW, usedPct: 20 }]),
      weeklyCostUsd: 40,
      now: NOW,
    })
    expect(v.weeklyBound).toBe(true)
    expect(v.two5xVs20x.two5xWins).toBe(true)
    expect(['max20x', 'above-20x']).toContain(v.recommended)
  })

  it('recommends 20x when the 5h window is the wall and weekly is calm', () => {
    const v = buildVerdict({
      weekly: snaps('7d', [
        { ts: NOW - 3_600_000, usedPct: 15, resetsAt: NOW + WEEK * 0.8 },
        { ts: NOW, usedPct: 18, resetsAt: NOW + WEEK * 0.8 },
      ]),
      fiveHour: snaps('5h', [
        { ts: NOW - 3_600_000, usedPct: 40 },
        { ts: NOW, usedPct: 95 },
      ]),
      weeklyCostUsd: 8,
      now: NOW,
    })
    expect(v.weeklyBound).toBe(false)
    expect(v.recommended).toBe('max20x')
    expect(v.two5xVs20x.two5xWins).toBe(false)
  })

  it('recommends Pro when both windows are quiet', () => {
    const v = buildVerdict({
      weekly: snaps('7d', [
        { ts: NOW - 3 * 24 * 3_600_000, usedPct: 4, resetsAt: NOW + WEEK * 0.5 },
        { ts: NOW, usedPct: 10, resetsAt: NOW + WEEK * 0.5 },
      ]),
      fiveHour: snaps('5h', [{ ts: NOW, usedPct: 12 }]),
      weeklyCostUsd: 2,
      now: NOW,
    })
    expect(v.recommended).toBe('pro')
  })

  it('still verdicts from weekly snapshots when 5h history is missing', () => {
    const v = buildVerdict({
      weekly: snaps('7d', [
        { ts: NOW - 3 * 24 * 3_600_000, usedPct: 30, resetsAt: NOW + WEEK * 0.6 },
        { ts: NOW, usedPct: 55, resetsAt: NOW + WEEK * 0.6 },
      ]),
      fiveHour: [],
      weeklyCostUsd: 15,
      now: NOW,
    })
    expect(v.recommended).not.toBe('unknown')
    expect(v.weeklyUsedPct).toBe(55)
    expect(v.fiveHourUsedPct).toBeNull()
  })
})
