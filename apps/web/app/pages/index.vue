<script setup lang="ts">
import { TrendingUp } from 'lucide-vue-next'

useHead({ title: 'Overview — nomnomtokens' })

const { data, pending, refresh } = useSummary()
const { data: audit, pending: auditPending, refresh: refreshAudit } = useAudit()
const { data: verdict } = useVerdict()
const { data: meta } = useMeta()
const { frame } = useLive()
const { data: alerts } = useFetch<{ hits: Array<{ id: string, message: string }> }>('/api/alerts', {
  key: 'overview-alerts',
})

// The headline is the one number that must never be stale, so it prefers the
// live frame and falls back to the fetched summary.
const today = computed(() => frame.value?.today ?? {
  costUsd: data.value?.totals.today.costUsd ?? 0,
  tokens: data.value?.totals.today.tokens ?? 0,
  sessions: data.value?.totals.today.sessions ?? 0,
  events: data.value?.totals.today.events ?? 0,
})

// Refetch the slower aggregates when live data says something changed, but no
// more than the SSE frame rate.
watch(() => frame.value?.events, (next, prev) => {
  if (prev !== undefined && next !== prev) {
    void refresh()
    void refreshAudit()
  }
})

const sparkValues = computed(() => data.value?.sparkline.map(p => p.costUsd) ?? [])

const tightest = computed(() => {
  const limits = data.value?.limits ?? []
  return limits.reduce<typeof limits[number] | null>(
    (worst, l) => (worst === null || l.usedPct > worst.usedPct ? l : worst),
    null,
  )
})

const mood = computed(() => moodFromPct(tightest.value?.usedPct ?? 0))

function moodFromPct(pct: number): string {
  if (pct < 5) return 'hungry'
  if (pct < 50) return 'content'
  if (pct < 80) return 'full'
  if (pct < 100) return 'stuffed'
  return 'overstuffed'
}

const isEmpty = computed(() => (meta.value?.bounds.events ?? 0) === 0)
</script>

<template>
  <div class="space-y-6">
    <EmptyState
      v-if="isEmpty && !pending"
      title="The model hasn't been fed yet"
      description="No spend recorded on this machine. Run a scan to read your Claude Code history, then this page fills in."
      command="npx nomnomtokens scan"
    />

    <template v-else>
      <div class="flex items-start justify-between gap-6">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight">Eaten today</h1>
          <p class="text-muted-foreground mt-1 text-sm">
            {{ meta?.bounds.first ? `History from ${formatDate(meta.bounds.first)}` : 'Local history' }}
          </p>
        </div>
        <Mascot :mood="mood" :size="56" />
      </div>

      <FilterBar />

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Today"
          :value="formatUsd(today.costUsd)"
          :detail="`${formatCompact(today.tokens)} tokens · ${today.sessions} sessions`"
          :loading="pending && !data"
        >
          <ChartsSparkline :values="sparkValues" class="mt-3 h-7 w-full" />
        </StatTile>

        <StatTile
          label="This week"
          :value="formatUsd(data?.totals.week.costUsd)"
          :detail="`${formatCompact(data?.totals.week.tokens ?? 0)} tokens`"
          :loading="pending && !data"
        />

        <StatTile
          label="This month"
          :value="formatUsd(data?.totals.month.costUsd)"
          :detail="`${data?.totals.month.sessions ?? 0} sessions`"
          :loading="pending && !data"
        />

        <StatTile
          label="Cache hit rate"
          hint="Cache reads as a share of all fresh input. Reads cost a tenth of fresh input, so this is the cheapest number to move."
          :value="formatRatio(data?.efficiency.cacheHitRate)"
          :detail="data?.efficiency.costPerKLines ? `${formatUsd(data.efficiency.costPerKLines)} per 1k lines` : undefined"
          :loading="pending && !data"
        />
      </div>

      <div v-if="data?.totals.range.unpricedEvents" class="text-muted-foreground text-xs">
        {{ data.totals.range.unpricedEvents }} events in this range use a model with no known price and are
        excluded from cost. Token counts still include them.
      </div>

      <AuditCard :audit="audit ?? null" :pending="auditPending" />

      <UiCard v-if="verdict && verdict.recommended !== 'unknown'">
        <UiCardHeader>
          <UiCardTitle>Verdict</UiCardTitle>
          <UiCardDescription>
            Weekly fill vs the name on the plan. Estimates as of {{ verdict.estimatesAsOf }}.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="space-y-3">
          <p class="text-lg font-medium">
            {{ verdict.recommended }}
            <span class="text-muted-foreground ml-2 text-sm font-normal">
              {{ verdict.weeklyBound ? 'weekly-bound' : '5h-bound' }}
            </span>
          </p>
          <p class="text-muted-foreground text-sm">{{ verdict.two5xVs20x.reason }}</p>
        </UiCardContent>
      </UiCard>

      <UiCard v-if="(alerts?.hits.length ?? 0) > 0">
        <UiCardHeader>
          <UiCardTitle class="text-destructive">Alerts</UiCardTitle>
          <UiCardDescription>Thresholds crossed against the local store.</UiCardDescription>
          <UiCardAction>
            <UiButton to="/alerts" variant="ghost" size="sm">Configure</UiButton>
          </UiCardAction>
        </UiCardHeader>
        <UiCardContent class="space-y-2">
          <p v-for="hit in alerts!.hits" :key="hit.id" class="text-sm">
            {{ hit.message }}
          </p>
        </UiCardContent>
      </UiCard>

      <UiCard v-if="(data?.limits.length ?? 0) > 0">
        <UiCardHeader>
          <UiCardTitle>Limits</UiCardTitle>
          <UiCardDescription>Projected from the burn rate within the current window.</UiCardDescription>
          <UiCardAction>
            <UiButton to="/limits" variant="ghost" size="sm">History</UiButton>
          </UiCardAction>
        </UiCardHeader>
        <UiCardContent class="space-y-5">
          <div v-for="limit in data!.limits" :key="`${limit.provider}-${limit.window}`" class="space-y-2">
            <div class="flex items-baseline justify-between gap-4 text-sm">
              <span class="font-medium">{{ limit.window }} window</span>
              <span class="tabular text-muted-foreground">{{ formatPct(limit.usedPct, 1) }}</span>
            </div>
            <UiProgress
              :value="limit.usedPct"
              :indicator-class="limit.usedPct >= 80 ? 'bg-destructive' : 'bg-primary'"
            />
            <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
              <TrendingUp class="size-3" />
              <template v-if="limit.willExhaustBeforeReset">
                At {{ limit.burnRatePctPerHour.toFixed(1) }}%/h you hit the cap
                <strong class="text-foreground font-medium">{{ formatWhen(limit.exhaustsAt, data!.now) }}</strong>
                — before it resets {{ formatWhen(limit.resetsAt, data!.now) }}.
              </template>
              <template v-else-if="limit.resetsAt">
                Resets {{ formatWhen(limit.resetsAt, data!.now) }}. Not on track to hit the cap first.
              </template>
              <template v-else>
                Not enough history to project yet ({{ limit.samples }} samples).
              </template>
            </p>
          </div>
        </UiCardContent>
      </UiCard>

      <UiCard v-else>
        <UiCardHeader>
          <UiCardTitle>Limits</UiCardTitle>
          <UiCardDescription>
            Subscription limits are only visible to the status line hook — they are not in the transcript.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <code class="bg-muted rounded-md px-2 py-1 font-mono text-xs">npx nomnomtokens init</code>
        </UiCardContent>
      </UiCard>
    </template>
  </div>
</template>
