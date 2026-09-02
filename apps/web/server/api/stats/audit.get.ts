import { buildAuditReport } from '@nomnomtokens/core'

/**
 * Audit payload for Overview, /audit, and CLI consumers of the same shape.
 */
export default defineEventHandler((event) => {
  const q = queries()
  const filters = readFilters(event)
  const now = Date.now()
  const from = filters.from ?? 0
  const to = filters.to ?? now

  const scoped = {
    ...filters,
    kind: filters.kind ?? 'tokens',
  }

  const totals = q.totals(scoped)
  const sidechain = q.sidechainTotals(scoped)
  const models = q.byUnitLabel(scoped)
  const sessions = q.sessionsAudit(scoped, 5)
  const coldResumes = q.coldResumesFor(sessions)

  return buildAuditReport({
    range: { from, to },
    totals: {
      costUsd: totals.costUsd,
      tokens: totals.tokens,
      events: totals.events,
      qtyIn: totals.qtyIn,
      qtyCacheRead: totals.qtyCacheRead,
    },
    sidechain: {
      taggedEvents: sidechain.taggedEvents,
      costUsd: sidechain.costUsd,
      tokens: sidechain.tokens,
    },
    models: models.map(m => ({ unitLabel: m.unitLabel, costUsd: m.costUsd })),
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      label: s.label,
      costUsd: s.costUsd,
      sidechainCostUsd: s.sidechainCostUsd,
      sidechainTagged: s.sidechainTagged,
    })),
    coldResumes,
  })
})
