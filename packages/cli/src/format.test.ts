import { describe, expect, it } from 'vitest'
import { untilReset } from './format.js'

const NOW = 1_700_000_000_000
const min = (n: number) => n * 60_000
const hour = (n: number) => n * 3_600_000

describe('untilReset', () => {
  it('drops the segment when there is no reset to show', () => {
    expect(untilReset(null, NOW)).toBeNull()
    expect(untilReset(undefined, NOW)).toBeNull()
    expect(untilReset(Number.NaN, NOW)).toBeNull()
  })

  it('reports minutes under an hour', () => {
    expect(untilReset(NOW + min(47), NOW)).toBe('47m')
    expect(untilReset(NOW + min(59) + 59_000, NOW)).toBe('59m')
  })

  it('never renders 0m — a window that is nearly up still has time on it', () => {
    expect(untilReset(NOW + 20_000, NOW)).toBe('1m')
  })

  it('pairs hours with minutes, and drops the minutes when they are zero', () => {
    expect(untilReset(NOW + hour(1) + min(47), NOW)).toBe('1h47m')
    expect(untilReset(NOW + hour(3), NOW)).toBe('3h')
  })

  it('rounds the leading unit down so it never promises time the user lacks', () => {
    expect(untilReset(NOW + hour(1) + min(59), NOW)).toBe('1h59m')
    expect(untilReset(NOW + hour(23) + min(59), NOW)).toBe('23h59m')
  })

  it('switches to days past 24 hours', () => {
    expect(untilReset(NOW + hour(24), NOW)).toBe('1d')
    expect(untilReset(NOW + hour(99), NOW)).toBe('4d3h')
    expect(untilReset(NOW + hour(24 * 7), NOW)).toBe('7d')
  })

  it('says "now" once the window has rolled over', () => {
    expect(untilReset(NOW, NOW)).toBe('now')
    expect(untilReset(NOW - hour(2), NOW)).toBe('now')
  })
})
