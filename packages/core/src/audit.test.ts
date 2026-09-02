import { describe, expect, it } from 'vitest'
import { buildAuditReport, type AuditInput } from './audit.js'

function base(over: Partial<AuditInput> = {}): AuditInput {
  return {
    range: { from: 0, to: 1 },
    totals: {
      costUsd: 100,
      tokens: 1_000_000,
      events: 10,
      qtyIn: 100_000,
      qtyCacheRead: 900_000,
    },
    sidechain: { taggedEvents: 0, costUsd: 0, tokens: 0 },
    models: [{ unitLabel: 'claude-sonnet-4-5', costUsd: 100 }],
    sessions: [],
    ...over,
  }
}

describe('buildAuditReport', () => {
  it('marks sidechain as untagged when no meta.sidechain events exist', () => {
    const report = buildAuditReport(base())
    expect(report.sidechain.tagged).toBe(false)
    expect(report.sidechain.shareOfCost).toBeNull()
    expect(report.tips.some(t => t.includes('Subagents'))).toBe(false)
  })

  it('computes sidechain share and tips when tagged spend is high', () => {
    const report = buildAuditReport(base({
      sidechain: { taggedEvents: 4, costUsd: 40, tokens: 400_000 },
      models: [{ unitLabel: 'claude-sonnet-4-5', costUsd: 100 }],
      totals: {
        costUsd: 100,
        tokens: 500_000,
        events: 10,
        qtyIn: 200_000,
        qtyCacheRead: 100_000,
      },
    }))
    expect(report.sidechain.tagged).toBe(true)
    expect(report.sidechain.shareOfCost).toBeCloseTo(0.4)
    expect(report.tips[0]).toMatch(/CLAUDE_CODE_SUBAGENT_MODEL/)
  })

  it('tips on frontier model dominance', () => {
    const report = buildAuditReport(base({
      totals: {
        costUsd: 100,
        tokens: 10_000,
        events: 5,
        qtyIn: 5_000,
        qtyCacheRead: 1_000,
      },
      models: [
        { unitLabel: 'claude-fable-5', costUsd: 80 },
        { unitLabel: 'claude-sonnet-4-5', costUsd: 20 },
      ],
    }))
    expect(report.models[0]?.unitLabel).toBe('claude-fable-5')
    expect(report.tips.some(t => t.includes('claude-fable-5'))).toBe(true)
  })

  it('tips on high cache-read share of tokens', () => {
    const report = buildAuditReport(base({
      sidechain: { taggedEvents: 0, costUsd: 0, tokens: 0 },
      models: [{ unitLabel: 'claude-haiku-4-5', costUsd: 10 }],
      totals: {
        costUsd: 10,
        tokens: 1_000_000,
        events: 3,
        qtyIn: 50_000,
        qtyCacheRead: 950_000,
      },
    }))
    expect(report.cache.hitRate).toBeGreaterThan(0.85)
    expect(report.tips.some(t => t.includes('Cache reads'))).toBe(true)
  })

  it('exposes session sidechainShare only when the session has tagged turns', () => {
    const report = buildAuditReport(base({
      sessions: [
        {
          sessionId: 'a',
          label: 'repo',
          costUsd: 20,
          sidechainCostUsd: 10,
          sidechainTagged: 2,
        },
        {
          sessionId: 'b',
          label: null,
          costUsd: 5,
          sidechainCostUsd: 0,
          sidechainTagged: 0,
        },
      ],
    }))
    expect(report.topSessions[0]?.sidechainShare).toBeCloseTo(0.5)
    expect(report.topSessions[1]?.sidechainShare).toBeNull()
  })

  it('caps tips at three', () => {
    const report = buildAuditReport(base({
      sidechain: { taggedEvents: 10, costUsd: 50, tokens: 100 },
      models: [{ unitLabel: 'claude-opus-4-6', costUsd: 100 }],
      totals: {
        costUsd: 100,
        tokens: 1_000_000,
        events: 20,
        qtyIn: 50_000,
        qtyCacheRead: 950_000,
      },
    }))
    expect(report.tips.length).toBeLessThanOrEqual(3)
    expect(report.tips.length).toBeGreaterThanOrEqual(2)
  })

  it('tips on a cold resume and lists the hits', () => {
    const report = buildAuditReport(base({
      totals: {
        costUsd: 10,
        tokens: 10_000,
        events: 4,
        qtyIn: 4_000,
        qtyCacheRead: 1_000,
      },
      models: [{ unitLabel: 'claude-haiku-4-5', costUsd: 10 }],
      coldResumes: [{
        sessionId: 'sess-cold',
        label: 'hot-repo',
        ts: 1,
        gapMs: 90 * 60_000,
        costUsd: 4.2,
        cacheWriteTokens: 80_000,
      }],
    }))
    expect(report.coldResumes).toHaveLength(1)
    expect(report.tips[0]).toMatch(/\/clear is cheaper than resume/)
    expect(report.tips[0]).toMatch(/hot-repo/)
  })
})
