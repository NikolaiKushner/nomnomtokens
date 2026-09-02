import { describe, expect, it } from 'vitest'
import { DEFAULT_CLEANUP_DAYS, transcriptRetentionWarning } from './commands/doctor.js'

const DAY = 86_400_000
const NOW = Date.parse('2026-09-02T00:00:00Z')

describe('transcriptRetentionWarning', () => {
  it('is silent when the store is younger than retention', () => {
    expect(transcriptRetentionWarning({
      storeFirst: NOW - 5 * DAY,
      oldestJsonlMtime: NOW - 5 * DAY,
      cleanupDays: DEFAULT_CLEANUP_DAYS,
      now: NOW,
    })).toBeNull()
  })

  it('warns when store history is older than cleanupPeriodDays', () => {
    const msg = transcriptRetentionWarning({
      storeFirst: NOW - 40 * DAY,
      oldestJsonlMtime: NOW - 5 * DAY,
      cleanupDays: 30,
      now: NOW,
    })
    expect(msg).toMatch(/store keeps history/)
    expect(msg).toMatch(/transcripts will not/)
  })

  it('warns when transcripts on disk start after store.first', () => {
    const msg = transcriptRetentionWarning({
      storeFirst: NOW - 20 * DAY,
      oldestJsonlMtime: NOW - 2 * DAY,
      cleanupDays: 30,
      now: NOW,
    })
    expect(msg).toMatch(/transcripts will not/)
  })

  it('returns null with an empty store', () => {
    expect(transcriptRetentionWarning({
      storeFirst: null,
      oldestJsonlMtime: null,
      cleanupDays: 30,
      now: NOW,
    })).toBeNull()
  })
})
