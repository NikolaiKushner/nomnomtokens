import { describe, expect, it } from 'vitest'
import { buildStatuslineParts } from './statusline-render.js'

const NOW = 1_700_000_000_000

describe('buildStatuslineParts', () => {
  it('puts 7d before 5h when weekly used% is higher', () => {
    const parts = buildStatuslineParts({
      fiveHour: 20,
      sevenDay: 91,
      cost: 4.2,
      ctx: 37,
      lines: 0,
      now: NOW,
    })
    const joined = parts.join('  ')
    expect(joined.indexOf('7d')).toBeLessThan(joined.indexOf('5h'))
  })

  it('keeps 5h first when it is the tighter window', () => {
    const parts = buildStatuslineParts({
      fiveHour: 80,
      sevenDay: 20,
      cost: null,
      ctx: null,
      lines: 0,
      now: NOW,
    })
    const joined = parts.join('  ')
    expect(joined.indexOf('5h')).toBeLessThan(joined.indexOf('7d'))
  })

  it('hints at Codex headroom when Claude weekly is against the wall', () => {
    const parts = buildStatuslineParts({
      fiveHour: 10,
      sevenDay: 88,
      cost: null,
      ctx: null,
      lines: 0,
      codexSevenDay: 12,
      now: NOW,
    })
    expect(parts.join('  ')).toContain('codex 7d 12%')
  })

  it('omits the Codex hint when Codex is also spent', () => {
    const parts = buildStatuslineParts({
      fiveHour: 10,
      sevenDay: 88,
      cost: null,
      ctx: null,
      lines: 0,
      codexSevenDay: 70,
      now: NOW,
    })
    expect(parts.join('  ')).not.toContain('codex')
  })
})
