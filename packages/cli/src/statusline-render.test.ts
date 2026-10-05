import { describe, expect, it } from 'vitest'
import { buildStatuslineParts, resolveWindow } from './statusline-render.js'

const NOW = 1_700_000_000_000
const ESC = '\u001b'

function plain(line: string): string {
  return line.replace(/\u001b\[[0-9;]*m/g, '')
}

const sample = {
  fiveHour: 73,
  sevenDay: 81,
  fiveHourResetsAt: (NOW / 1000) + 107 * 60,
  sevenDayResetsAt: (NOW / 1000) + 99 * 3600,
  ctx: 37,
  model: 'Opus 4.6',
  now: NOW,
}

describe('buildStatuslineParts', () => {
  it('renders windows in a fixed order, separated by pipes', () => {
    expect(plain(buildStatuslineParts(sample))).toBe(
      'Limits: 7d  81%  4d3h  |  5h  73%  1h47m  |  ctx. 37%  |  Opus 4.6',
    )
  })

  it('keeps 7d before 5h even when the 5h window is tighter', () => {
    const line = plain(buildStatuslineParts({
      fiveHour: 80,
      sevenDay: 20,
      ctx: null,
      now: NOW,
    }))
    expect(line.indexOf('7d')).toBeLessThan(line.indexOf('5h'))
    expect(line).not.toContain('ctx')
  })

  it('paints the 7d, 5h, and ctx labels cyan', () => {
    const prev = process.env.NO_COLOR
    delete process.env.NO_COLOR
    try {
      const line = buildStatuslineParts(sample)
      expect(line).toContain(`${ESC}[36m7d${ESC}[0m  `)
      expect(line).toContain(`${ESC}[36m5h${ESC}[0m  `)
      expect(line).toContain(`${ESC}[36mctx${ESC}[0m.`)
      expect(line).toContain(`${ESC}[36mOpus 4.6${ESC}[0m`)
      expect(line).not.toContain(`${ESC}[36m81%`)
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = prev
    }
  })

  it('leaves labels plain when NO_COLOR is set', () => {
    const prev = process.env.NO_COLOR
    process.env.NO_COLOR = '1'
    try {
      expect(buildStatuslineParts(sample)).toBe(
        'Limits: 7d  81%  4d3h  |  5h  73%  1h47m  |  ctx. 37%  |  Opus 4.6',
      )
    } finally {
      if (prev === undefined) delete process.env.NO_COLOR
      else process.env.NO_COLOR = prev
    }
  })

  it('hints at Codex headroom when Claude weekly is against the wall', () => {
    const line = plain(buildStatuslineParts({
      fiveHour: 10,
      sevenDay: 88,
      ctx: null,
      codexSevenDay: 12,
      now: NOW,
    }))
    expect(line).toContain('codex: 12%')
  })

  it('omits the Codex hint when Codex is also spent', () => {
    const line = plain(buildStatuslineParts({
      fiveHour: 10,
      sevenDay: 88,
      ctx: null,
      codexSevenDay: 70,
      now: NOW,
    }))
    expect(line).not.toContain('codex')
  })
})

describe('resolveWindow', () => {
  const open = { usedPct: 73, resetsAt: NOW + 60_000 }

  it('keeps the live percentage when Claude sent one', () => {
    expect(resolveWindow(10, 99, open, NOW)).toEqual({ pct: 10, resetsAtSeconds: 99 })
  })

  it('uses the stored snapshot while its window is still open', () => {
    expect(resolveWindow(null, undefined, open, NOW)).toEqual({
      pct: 73,
      resetsAtSeconds: open.resetsAt / 1000,
    })
  })

  it('drops a stored snapshot once the window has reset', () => {
    expect(resolveWindow(null, undefined, { usedPct: 90, resetsAt: NOW - 1 }, NOW)).toEqual({ pct: null })
  })
})
