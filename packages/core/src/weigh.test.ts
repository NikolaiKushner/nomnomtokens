import { describe, expect, it } from 'vitest'
import { buildWeigh, pairRisingSnapshots, type WeighGap } from './weigh.js'

function gap(deltaPct: number, models: Array<[string, number]>): WeighGap {
  return {
    deltaPct,
    models: models.map(([unitLabel, costUsd]) => ({ unitLabel, costUsd })),
  }
}

describe('buildWeigh', () => {
  it('median pp per dollar matches four clean gaps', () => {
    const report = buildWeigh([
      gap(1, [['opus', 1]]),
      gap(2, [['opus', 1]]),
      gap(3, [['opus', 1]]),
      gap(4, [['opus', 1]]),
    ])
    const opus = report.models[0]!
    expect(opus.status).toBe('ok')
    expect(opus.cleanIntervals).toBe(4)
    expect(opus.ppPerUsd).toEqual({ p25: 1.75, median: 2.5, p75: 3.25 })
    expect(report.blendedPpPerUsd).toBeCloseTo(2.5)
    expect(report.cleanIntervals).toBe(4)
  })

  it('keeps a mixed gap in the blend and out of the model median', () => {
    const report = buildWeigh([
      gap(1, [['opus', 1]]),
      gap(2, [['opus', 1]]),
      gap(3, [['opus', 1]]),
      gap(10, [['opus', 1], ['sonnet', 1]]),
    ])
    const opus = report.models.find(m => m.unitLabel === 'opus')!
    expect(opus.cleanIntervals).toBe(3)
    expect(opus.ppPerUsd?.median).toBe(2)
    expect(report.models.some(m => m.unitLabel === 'sonnet')).toBe(false)
    expect(report.blendedPpPerUsd).toBeCloseTo((1 + 2 + 3 + 10) / 5)
    expect(report.risingIntervals).toBe(4)
    expect(report.cleanIntervals).toBe(3)
  })

  it('drops a reset and a zero-cost gap', () => {
    const report = buildWeigh([
      gap(-20, [['opus', 5]]),
      gap(4, [['opus', 0]]),
      gap(1, [['opus', 1]]),
      gap(1, [['opus', 1]]),
      gap(1, [['opus', 1]]),
    ])
    expect(report.risingIntervals).toBe(3)
    expect(report.models[0]?.ppPerUsd?.median).toBe(1)
  })

  it('stays unknown below three clean gaps', () => {
    const report = buildWeigh([
      gap(5, [['opus', 1]]),
      gap(9, [['opus', 1]]),
    ])
    expect(report.models[0]).toMatchObject({
      unitLabel: 'opus',
      status: 'unknown',
      ppPerUsd: null,
      cleanIntervals: 2,
    })
  })

  it('does not treat an empty slice list as free spend', () => {
    const report = buildWeigh([gap(12, [])])
    expect(report.blendedPpPerUsd).toBeNull()
    expect(report.models).toEqual([])
    expect(report.caveats.length).toBeGreaterThan(0)
  })
})

describe('pairRisingSnapshots', () => {
  it('starts over after a reset and ignores a flat step', () => {
    const pairs = pairRisingSnapshots([
      { ts: 1, usedPct: 10 },
      { ts: 2, usedPct: 40 },
      { ts: 3, usedPct: 5 },
      { ts: 4, usedPct: 5 },
      { ts: 5, usedPct: 15 },
    ])
    expect(pairs).toEqual([{ from: 4, to: 5, deltaPct: 10 }])
  })
})
