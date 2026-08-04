import type { H3Event } from 'h3'
import type { Filters } from '@nomnomtokens/db'
import type { Granularity } from '@nomnomtokens/core'

/**
 * Every screen shares one filter vocabulary, and it round-trips through the
 * URL so a dashboard state is a link you can paste to someone.
 */

export type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all'

const RANGE_MS: Record<Exclude<RangeKey, 'all'>, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
  '30d': 30 * 24 * 3_600_000,
  '90d': 90 * 24 * 3_600_000,
}

export function rangeToFrom(range: RangeKey, now = Date.now()): number | undefined {
  return range === 'all' ? undefined : now - RANGE_MS[range]
}

function list(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const items = value.split(',').map(s => s.trim()).filter(Boolean)
  return items.length > 0 ? items : undefined
}

export function readFilters(event: H3Event): Filters & { range: RangeKey } {
  const q = getQuery(event)
  const range = (typeof q.range === 'string' ? q.range : '7d') as RangeKey
  const validRange: RangeKey = ['24h', '7d', '30d', '90d', 'all'].includes(range) ? range : '7d'

  const from = typeof q.from === 'string' ? Number.parseInt(q.from, 10) : rangeToFrom(validRange)
  const to = typeof q.to === 'string' ? Number.parseInt(q.to, 10) : undefined

  return {
    range: validRange,
    from: Number.isFinite(from) ? from : undefined,
    to: Number.isFinite(to) ? to : undefined,
    provider: list(q.provider),
    scopeHash: list(q.scope),
    sessionId: typeof q.session === 'string' ? q.session : undefined,
    // The UI always pins a kind before summing: tokens and minutes are not
    // addable, and cost is the only axis on which everything compares.
    kind: typeof q.kind === 'string' ? q.kind : 'tokens',
  }
}

export function readGranularity(event: H3Event, fallback: Granularity = 'day'): Granularity {
  const g = getQuery(event).granularity
  return typeof g === 'string' && ['hour', 'day', 'week', 'month'].includes(g)
    ? (g as Granularity)
    : fallback
}
