import type { RangeKey } from '~~/server/utils/filters'

/**
 * Filter state lives in the URL, not in a store.
 *
 * That is the difference between a dev tool and a CRUD app: back/forward work,
 * a refresh keeps your view, and "look at this project's last 30 days" is a
 * link you can paste to someone.
 */
export function useFilters() {
  const route = useRoute()
  const router = useRouter()

  const range = computed<RangeKey>(() => {
    const v = route.query.range
    return typeof v === 'string' && ['24h', '7d', '30d', '90d', 'all'].includes(v)
      ? (v as RangeKey)
      : '7d'
  })

  const scopes = computed<string[]>(() => {
    const v = route.query.scope
    return typeof v === 'string' && v ? v.split(',').filter(Boolean) : []
  })

  const providers = computed<string[]>(() => {
    const v = route.query.provider
    return typeof v === 'string' && v ? v.split(',').filter(Boolean) : []
  })

  const metric = computed<'cost' | 'tokens' | 'sessions'>(() => {
    const v = route.query.metric
    return v === 'tokens' || v === 'sessions' ? v : 'cost'
  })

  function patch(next: Record<string, string | undefined>) {
    const query = { ...route.query, ...next }
    for (const [k, v] of Object.entries(query)) {
      // keep the URL clean: an absent filter should not appear as `?scope=`
      if (v === undefined || v === '') delete query[k]
    }
    void router.push({ query })
  }

  return {
    range,
    scopes,
    providers,
    metric,
    hasScopeFilter: computed(() => scopes.value.length > 0),

    setRange: (value: RangeKey) => patch({ range: value === '7d' ? undefined : value }),
    setMetric: (value: string) => patch({ metric: value === 'cost' ? undefined : value }),
    clearScopes: () => patch({ scope: undefined }),

    setScopes(hashes: string[]) {
      const unique = [...new Set(hashes.filter(Boolean))]
      patch({ scope: unique.join(',') || undefined })
    },

    toggleScope(hash: string) {
      const next = scopes.value.includes(hash)
        ? scopes.value.filter(s => s !== hash)
        : [...scopes.value, hash]
      patch({ scope: next.join(',') || undefined })
    },

    /** Toggle every hash in a label group on or off together. */
    toggleScopeGroup(hashes: string[]) {
      if (hashes.length === 0) return
      const allOn = hashes.every(h => scopes.value.includes(h))
      const next = allOn
        ? scopes.value.filter(s => !hashes.includes(s))
        : [...new Set([...scopes.value, ...hashes])]
      patch({ scope: next.join(',') || undefined })
    },

    toggleProvider(name: string) {
      const next = providers.value.includes(name)
        ? providers.value.filter(p => p !== name)
        : [...providers.value, name]
      patch({ provider: next.join(',') || undefined })
    },

    /** Query params for the API, derived from the same URL state. */
    apiQuery: computed(() => ({
      range: range.value,
      scope: scopes.value.join(',') || undefined,
      provider: providers.value.join(',') || undefined,
    })),
  }
}
