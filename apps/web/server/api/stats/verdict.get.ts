import { buildVerdict } from '@nomnomtokens/core'

export default defineEventHandler(() => {
  const q = queries()
  const now = Date.now()
  const weekFrom = now - 7 * 24 * 3_600_000
  return buildVerdict({
    weekly: q.limitSnapshots('claude-code', '7d', weekFrom),
    fiveHour: q.limitSnapshots('claude-code', '5h', weekFrom),
    weeklyCostUsd: q.totals({
      from: weekFrom,
      to: now,
      kind: 'tokens',
      provider: ['claude-code'],
    }).costUsd,
    now,
  })
})
