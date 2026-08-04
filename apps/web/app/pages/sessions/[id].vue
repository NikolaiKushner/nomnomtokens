<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next'

const route = useRoute()
const id = computed(() => String(route.params.id))

const { data, pending, error } = await useFetch<{
  sessionId: string
  totals: import('~/composables/useStats').TotalsRow
  lines: { added: number, removed: number }
  events: Array<{
    id: string
    ts: number
    unitLabel: string | null
    costUsd: number | null
    qty: Record<string, number>
    meta: Record<string, number>
  }>
}>(() => `/api/stats/session/${id.value}`)

useHead({ title: () => `Session ${id.value.slice(0, 8)} — nomnomtokens` })

/** Running total, so the chart shows how the bill accumulated turn by turn. */
const cumulative = computed(() => {
  let running = 0
  return (data.value?.events ?? []).map((e) => {
    running += e.costUsd ?? 0
    return running
  })
})

const peak = computed(() =>
  (data.value?.events ?? []).reduce<{ cost: number, ts: number } | null>(
    (max, e) => (max === null || (e.costUsd ?? 0) > max.cost ? { cost: e.costUsd ?? 0, ts: e.ts } : max),
    null,
  ),
)
</script>

<template>
  <div class="space-y-6">
    <UiButton to="/sessions" variant="ghost" size="sm" class="-ml-2 gap-1.5">
      <ArrowLeft class="size-4" />
      Sessions
    </UiButton>

    <div v-if="error">
      <EmptyState
        title="No such session"
        description="It may have been outside the scanned history, or the id is wrong."
      />
    </div>

    <template v-else-if="data">
      <div>
        <h1 class="font-mono text-2xl font-semibold tracking-tight">{{ data.sessionId.slice(0, 8) }}</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          {{ data.events.length }} priced turns ·
          {{ data.lines.added + data.lines.removed }} lines changed
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Cost" :value="formatUsd(data.totals.costUsd)" />
        <StatTile label="Tokens" :value="formatCompact(data.totals.tokens)" />
        <StatTile
          label="Cache read"
          :value="formatCompact(data.totals.qtyCacheRead)"
          :detail="`${formatRatio(data.totals.qtyCacheRead / (data.totals.qtyCacheRead + data.totals.qtyIn || 1))} hit rate`"
        />
        <StatTile
          label="Most expensive turn"
          :value="formatUsd(peak?.cost ?? 0)"
          :detail="peak ? formatDateTime(peak.ts) : undefined"
        />
      </div>

      <UiCard>
        <UiCardHeader class="border-b pb-4">
          <UiCardTitle>Cumulative spend</UiCardTitle>
          <UiCardDescription>How the bill accrued across the session.</UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="pt-5">
          <ChartsSparkline :values="cumulative" class="h-24 w-full" />
        </UiCardContent>
      </UiCard>

      <UiCard class="py-0">
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead class="pl-4">Time</UiTableHead>
              <UiTableHead>Model</UiTableHead>
              <UiTableHead numeric>Cost</UiTableHead>
              <UiTableHead numeric>In</UiTableHead>
              <UiTableHead numeric>Out</UiTableHead>
              <UiTableHead numeric>Cache read</UiTableHead>
              <UiTableHead numeric class="pr-4">Lines</UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-for="e in data.events" :key="e.id">
              <UiTableCell class="text-muted-foreground pl-4 tabular text-xs">
                {{ new Date(e.ts).toLocaleTimeString() }}
              </UiTableCell>
              <UiTableCell class="font-mono text-xs">{{ e.unitLabel ?? '—' }}</UiTableCell>
              <UiTableCell numeric>{{ formatUsd(e.costUsd) }}</UiTableCell>
              <UiTableCell numeric>{{ formatCompact(e.qty.in ?? 0) }}</UiTableCell>
              <UiTableCell numeric>{{ formatCompact(e.qty.out ?? 0) }}</UiTableCell>
              <UiTableCell numeric>{{ formatCompact(e.qty.cacheRead ?? 0) }}</UiTableCell>
              <UiTableCell numeric class="pr-4">
                <span v-if="(e.meta.linesAdded ?? 0) + (e.meta.linesRemoved ?? 0) > 0">
                  <span class="text-success">+{{ e.meta.linesAdded ?? 0 }}</span>
                  <span class="text-destructive ml-1">−{{ e.meta.linesRemoved ?? 0 }}</span>
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </UiCard>
    </template>

    <UiSkeleton v-else-if="pending" class="h-96 w-full" />
  </div>
</template>
