/**
 * Data access.
 *
 * Every endpoint is fetched with the current filter query as part of the cache
 * key, so changing a filter refetches exactly the screens that depend on it and
 * nothing else.
 */

function withFilters<T>(key: string, path: string, extra?: () => Record<string, unknown>) {
  const filters = useFilters()
  return useFetch<T>(path, {
    key: `${key}`,
    query: computed(() => ({ ...filters.apiQuery.value, ...extra?.() })),
    // the dashboard is local; a spinner on every keystroke is worse than a
    // one-frame stale number
    keepalive: true,
  })
}

export interface TotalsRow {
  costUsd: number
  unpricedEvents: number
  tokens: number
  events: number
  sessions: number
  qtyIn: number
  qtyOut: number
  qtyCacheCreate: number
  qtyCacheCreate1h: number
  qtyCacheRead: number
}

export interface LimitForecast {
  provider: string
  window: string
  usedPct: number
  burnRatePctPerHour: number
  exhaustsAt: number | null
  resetsAt: number | null
  willExhaustBeforeReset: boolean
  samples: number
}

export interface Summary {
  now: number
  range: string
  totals: { today: TotalsRow, week: TotalsRow, month: TotalsRow, range: TotalsRow }
  sparkline: Array<{ bucket: string, costUsd: number, tokens: number }>
  efficiency: { cacheHitRate: number | null, costPerKLines: number | null, linesChanged: number }
  limits: LimitForecast[]
}

export const useSummary = () => withFilters<Summary>('summary', '/api/stats/summary')

export interface SeriesRow extends TotalsRow { bucket: string, group: string | null }

export const useSeries = (granularity: Ref<string>, groupBy?: Ref<string | undefined>) =>
  withFilters<{ granularity: string, groupBy: string | null, groups: string[], rows: SeriesRow[] }>(
    'series',
    '/api/stats/series',
    () => ({ granularity: granularity.value, groupBy: groupBy?.value }),
  )

export const useHeatmap = () =>
  withFilters<{
    cells: Array<{ weekday: number, hour: number, costUsd: number, tokens: number, events: number }>
    max: { costUsd: number, tokens: number, events: number }
  }>('heatmap', '/api/stats/heatmap')

export interface ScopeRow extends TotalsRow {
  scopeHash: string
  label: string | null
  lastSeen: number | null
  cacheHitRate: number | null
  previousCostUsd: number | null
  trendPct: number | null
}

export const useScopeStats = () =>
  withFilters<{ rows: ScopeRow[], hasTrend: boolean }>('scopes', '/api/stats/scopes')

export const useProviderStats = () =>
  withFilters<{
    providers: Array<TotalsRow & {
      provider: string
      cacheHitRate: number | null
      costPerKLines: number | null
      linesChanged: number
    }>
    models: Array<TotalsRow & { unitLabel: string | null, cacheHitRate: number | null }>
  }>('providers', '/api/stats/providers')

export interface SessionRow extends TotalsRow {
  sessionId: string
  scopeHash: string
  label: string | null
  startedAt: number
  endedAt: number
}

export const useSessionStats = () =>
  withFilters<{ rows: SessionRow[] }>('sessions', '/api/stats/sessions')

export const useLimits = () =>
  useFetch<{
    now: number
    windows: Array<{
      provider: string
      window: string
      forecast: LimitForecast | null
      mood: string
      hits: number[]
      snapshots: Array<{ ts: number, usedPct: number, resetsAt: number | null }>
    }>
  }>('/api/stats/limits', { key: 'limits' })

export interface Meta {
  bounds: { first: number | null, last: number | null, events: number }
  scopes: Array<{ scopeHash: string, label: string, provider: string, lastSeen: number }>
  providers: Array<{ provider: string, events: number }>
  models: Array<{ unitLabel: string | null, events: number }>
  limitWindows: Array<{ provider: string, window: string }>
  dbPath: string
}

export function useMeta() {
  return useFetch<Meta>('/api/meta', { key: 'meta' })
}

/** Scope list, shared by the palette and the filter bar. */
export function useScopes() {
  const { data } = useMeta()
  return { scopes: computed(() => data.value?.scopes ?? []) }
}
