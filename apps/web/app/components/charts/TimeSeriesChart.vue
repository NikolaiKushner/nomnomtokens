<script setup lang="ts">
import { VisAxis, VisCrosshair, VisStackedBar, VisTooltip, VisXYContainer } from '@unovis/vue'
import { cn } from '~/lib/utils'
import type { SeriesRow } from '~/composables/useStats'

/**
 * Stacked series over time.
 *
 * Unovis, for the reasons in spec.md §3.4: it styles from CSS custom properties,
 * so the chart follows our shadcn tokens and switches theme without a re-render,
 * and it composes rather than wrapping — the container and marks are separate
 * components, which is what lets the crosshair below share our Tooltip styling.
 */
const props = withDefaults(
  defineProps<{
    rows: SeriesRow[]
    groups: string[]
    metric: 'cost' | 'tokens' | 'sessions'
    class?: string
    height?: number
  }>(),
  { height: 280 },
)

interface Datum {
  x: number
  label: string
  values: number[]
  total: number
}

const seriesKeys = computed(() => (props.groups.length > 0 ? props.groups : ['total']))

const metricOf = (row: SeriesRow) =>
  props.metric === 'cost' ? row.costUsd : props.metric === 'tokens' ? row.tokens : row.sessions

const data = computed<Datum[]>(() => {
  const buckets = new Map<string, Datum>()

  for (const row of props.rows) {
    let datum = buckets.get(row.bucket)
    if (!datum) {
      datum = {
        x: new Date(row.bucket).getTime(),
        label: row.bucket,
        values: seriesKeys.value.map(() => 0),
        total: 0,
      }
      buckets.set(row.bucket, datum)
    }
    const index = props.groups.length > 0
      ? seriesKeys.value.indexOf(row.group ?? 'unknown')
      : 0
    if (index >= 0) {
      const v = metricOf(row)
      datum.values[index] = (datum.values[index] ?? 0) + v
      datum.total += v
    }
  }

  return [...buckets.values()].sort((a, b) => a.x - b.x)
})

const x = (d: Datum) => d.x
// One accessor per series is what Unovis's stacked bar expects.
const y = computed(() => seriesKeys.value.map((_, i) => (d: Datum) => d.values[i] ?? 0))
const color = (_: unknown, i: number) => `var(--chart-${(i % 8) + 1})`

const formatValue = (v: number) =>
  props.metric === 'cost' ? formatUsd(v) : props.metric === 'tokens' ? formatCompact(v) : String(v)

const tickFormat = (t: number) => formatDate(t)

function tooltipTemplate(d: Datum): string {
  const rows = seriesKeys.value
    .map((key, i) => ({ key, value: d.values[i] ?? 0, i }))
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .map(r => `
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-[2px]" style="background: var(--chart-${(r.i % 8) + 1})"></span>
        <span class="flex-1 truncate">${r.key}</span>
        <span class="tabular font-medium">${formatValue(r.value)}</span>
      </div>`)
    .join('')

  return `
    <div class="bg-popover text-popover-foreground min-w-44 space-y-1.5 rounded-md border p-2.5 text-xs shadow-md">
      <div class="font-medium">${formatDate(d.x)}</div>
      ${rows || '<div class="text-muted-foreground">no activity</div>'}
      <div class="flex items-center gap-2 border-t pt-1.5">
        <span class="flex-1">Total</span>
        <span class="tabular font-medium">${formatValue(d.total)}</span>
      </div>
    </div>`
}
</script>

<template>
  <ClientOnly>
    <VisXYContainer
      :data="data"
      :height="props.height"
      :margin="{ top: 8, right: 8, bottom: 24, left: 48 }"
      :class="cn('chart-surface w-full', props.class)"
    >
      <VisStackedBar :x="x" :y="y" :color="color" :rounded-corners="3" :bar-padding="0.2" />
      <VisAxis
        type="x"
        :tick-format="tickFormat"
        :num-ticks="6"
        :grid-line="false"
        :domain-line="false"
        color="var(--muted-foreground)"
      />
      <VisAxis
        type="y"
        :tick-format="formatValue"
        :num-ticks="4"
        :domain-line="false"
        color="var(--muted-foreground)"
      />
      <VisCrosshair :template="tooltipTemplate" color="var(--foreground)" />
      <VisTooltip />
    </VisXYContainer>

    <template #fallback>
      <UiSkeleton :style="{ height: `${props.height}px` }" class="w-full" />
    </template>
  </ClientOnly>
</template>

<style>
/* Unovis draws its own axis/tick styling; pin it to our tokens rather than
   overriding per-chart. */
.unovis-xy-container {
  --vis-axis-tick-color: var(--border);
  --vis-axis-tick-label-color: var(--muted-foreground);
  --vis-axis-grid-color: var(--border);
  --vis-axis-label-color: var(--muted-foreground);
  --vis-axis-tick-label-font-size: 11px;
  --vis-crosshair-line-stroke-color: var(--muted-foreground);
  --vis-crosshair-circle-stroke-color: var(--background);
  --vis-tooltip-background-color: transparent;
  --vis-tooltip-border-color: transparent;
  --vis-tooltip-padding: 0;
  --vis-tooltip-shadow-color: transparent;
}
</style>
