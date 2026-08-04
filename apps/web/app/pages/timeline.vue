<script setup lang="ts">
useHead({ title: 'Timeline — nomnomtokens' })

const filters = useFilters()
const route = useRoute()
const router = useRouter()

const granularity = computed(() => {
  const q = route.query.granularity
  if (typeof q === 'string' && ['hour', 'day', 'week', 'month'].includes(q)) return q
  // sensible default per range: hourly for a day, daily for a month, weekly beyond
  return filters.range.value === '24h' ? 'hour' : filters.range.value === '90d' ? 'week' : 'day'
})

const groupBy = ref<string | undefined>('unitLabel')

const { data: series, pending } = useSeries(granularity, groupBy)
const { data: heat } = useHeatmap()

const hidden = ref<string[]>([])
const visibleRows = computed(() =>
  (series.value?.rows ?? []).filter(r => !hidden.value.includes(r.group ?? 'unknown')),
)
const visibleGroups = computed(() =>
  (series.value?.groups ?? []).filter(g => !hidden.value.includes(g)),
)

function toggle(name: string) {
  hidden.value = hidden.value.includes(name)
    ? hidden.value.filter(n => n !== name)
    : [...hidden.value, name]
}

const METRICS = [
  { value: 'cost', label: 'Cost' },
  { value: 'tokens', label: 'Volume' },
  { value: 'sessions', label: 'Sessions' },
]

const GRANULARITIES = [
  { value: 'hour', label: 'Hourly' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
]

const GROUPINGS = [
  { value: 'unitLabel', label: 'By model' },
  { value: 'provider', label: 'By provider' },
  { value: '', label: 'No split' },
]

function setGranularity(value: string) {
  void router.push({ query: { ...route.query, granularity: value } })
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Timeline</h1>
      <p class="text-muted-foreground mt-1 text-sm">When the tokens go, and to which model.</p>
    </div>

    <FilterBar>
      <template #actions>
        <div class="flex items-center gap-2">
          <UiSelect
            :model-value="granularity"
            :options="GRANULARITIES"
            aria-label="Bucket size"
            class="w-32"
            @update:model-value="setGranularity"
          />
          <UiSelect
            :model-value="groupBy ?? ''"
            :options="GROUPINGS"
            aria-label="Split by"
            class="w-36"
            @update:model-value="groupBy = $event || undefined"
          />
        </div>
      </template>
    </FilterBar>

    <UiCard>
      <UiCardHeader class="border-b pb-4">
        <UiCardTitle>Spend over time</UiCardTitle>
        <UiCardDescription>Stacked by {{ groupBy === 'provider' ? 'provider' : groupBy ? 'model' : 'total' }}.</UiCardDescription>
        <UiCardAction>
          <UiTabs
            :model-value="filters.metric.value"
            :options="METRICS"
            aria-label="Metric"
            @update:model-value="filters.setMetric($event)"
          />
        </UiCardAction>
      </UiCardHeader>
      <UiCardContent class="pt-4">
        <UiSkeleton v-if="pending && !series" class="h-70 w-full" />
        <template v-else>
          <ChartsTimeSeriesChart
            :rows="visibleRows"
            :groups="visibleGroups"
            :metric="filters.metric.value"
          />
          <ChartsChartLegend
            v-if="(series?.groups.length ?? 0) > 1"
            :items="series!.groups"
            :hidden="hidden"
            class="mt-4"
            @toggle="toggle"
          />
        </template>
      </UiCardContent>
    </UiCard>

    <UiCard>
      <UiCardHeader class="border-b pb-4">
        <UiCardTitle>When you work</UiCardTitle>
        <UiCardDescription>
          Hour of day by weekday, across the selected range.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="pt-5">
        <ChartsHeatmap
          v-if="heat"
          :cells="heat.cells"
          :max="heat.max"
          :metric="filters.metric.value"
        />
        <UiSkeleton v-else class="h-32 w-full" />
      </UiCardContent>
    </UiCard>
  </div>
</template>
