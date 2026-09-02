import { describe, expect, it } from 'vitest'
import {
  COLD_GAP_MS,
  collectColdResumes,
  detectColdResumes,
  type SessionTurn,
} from './cold-resume.js'

const T0 = Date.parse('2026-08-01T10:00:00Z')

function turn(over: Partial<SessionTurn> & { ts: number }): SessionTurn {
  return {
    costUsd: 0.2,
    qty: { in: 100, out: 50, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 8_000 },
    ...over,
  }
}

describe('detectColdResumes', () => {
  it('flags a large cache write after an idle gap', () => {
    const hits = detectColdResumes('s1', 'repo', [
      turn({ ts: T0, qty: { in: 200, out: 40, cacheCreate: 3_000, cacheCreate1h: 0, cacheRead: 0 } }),
      turn({
        ts: T0 + 5 * 60_000,
        qty: { in: 80, out: 40, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 10_000 },
        costUsd: 0.1,
      }),
      turn({
        ts: T0 + COLD_GAP_MS + 10 * 60_000,
        qty: { in: 200, out: 40, cacheCreate: 80_000, cacheCreate1h: 0, cacheRead: 0 },
        costUsd: 4.2,
      }),
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      sessionId: 's1',
      label: 'repo',
      costUsd: 4.2,
      cacheWriteTokens: 80_000,
    })
    expect(hits[0]!.gapMs).toBeGreaterThanOrEqual(COLD_GAP_MS)
  })

  it('ignores a cache-hit turn five minutes later', () => {
    const hits = detectColdResumes('s1', null, [
      turn({ ts: T0, qty: { in: 100, out: 20, cacheCreate: 5_000, cacheCreate1h: 0, cacheRead: 0 } }),
      turn({
        ts: T0 + 5 * 60_000,
        qty: { in: 50, out: 20, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 9_000 },
      }),
    ])
    expect(hits).toEqual([])
  })

  it('returns empty when the session has no cacheCreate at all', () => {
    const hits = detectColdResumes('cursor-s', 'app', [
      turn({ ts: T0, qty: { in: 1_000, out: 200, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 0 } }),
      turn({
        ts: T0 + COLD_GAP_MS * 2,
        qty: { in: 2_000, out: 400, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 0 },
        costUsd: 1,
      }),
    ])
    expect(hits).toEqual([])
  })

  it('skips tiny cache writes under the floor', () => {
    const hits = detectColdResumes('s1', null, [
      turn({ ts: T0, qty: { in: 10, out: 5, cacheCreate: 100, cacheCreate1h: 0, cacheRead: 0 } }),
      turn({
        ts: T0 + COLD_GAP_MS + 1,
        qty: { in: 10, out: 5, cacheCreate: 500, cacheCreate1h: 0, cacheRead: 0 },
      }),
    ])
    expect(hits).toEqual([])
  })
})

describe('collectColdResumes', () => {
  it('keeps the costliest hits across sessions', () => {
    const rows = collectColdResumes([
      {
        sessionId: 'cheap',
        label: 'a',
        turns: [
          turn({ ts: T0, qty: { in: 10, out: 5, cacheCreate: 3_000, cacheCreate1h: 0, cacheRead: 0 } }),
          turn({
            ts: T0 + COLD_GAP_MS + 1,
            costUsd: 1,
            qty: { in: 10, out: 5, cacheCreate: 20_000, cacheCreate1h: 0, cacheRead: 0 },
          }),
        ],
      },
      {
        sessionId: 'pricey',
        label: 'b',
        turns: [
          turn({ ts: T0, qty: { in: 10, out: 5, cacheCreate: 3_000, cacheCreate1h: 0, cacheRead: 0 } }),
          turn({
            ts: T0 + COLD_GAP_MS + 1,
            costUsd: 9,
            qty: { in: 10, out: 5, cacheCreate: 90_000, cacheCreate1h: 0, cacheRead: 0 },
          }),
        ],
      },
    ], 1)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.sessionId).toBe('pricey')
  })
})
