<script setup lang="ts">
import { cn } from '~/lib/utils'

/**
 * Hour x weekday heatmap, GitHub-contributions style.
 *
 * Hand-rolled SVG rather than Unovis: this is a fixed 7x24 grid of rects with
 * one quantised colour scale, which is less code than configuring a chart
 * library for it and keeps the cells addressable for the tooltip.
 */
const props = defineProps<{
  cells: Array<{ weekday: number, hour: number, costUsd: number, tokens: number, events: number }>
  max: { costUsd: number, tokens: number, events: number }
  metric: 'cost' | 'tokens' | 'sessions'
  class?: string
}>()

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const value = (c: { costUsd: number, tokens: number, events: number }) =>
  props.metric === 'cost' ? c.costUsd : props.metric === 'tokens' ? c.tokens : c.events

const max = computed(() =>
  props.metric === 'cost' ? props.max.costUsd : props.metric === 'tokens' ? props.max.tokens : props.max.events,
)

/**
 * Five quantised steps, not a continuous ramp. Continuous opacity looks
 * smoother but reads worse: at a glance you can count five levels and you
 * cannot count sixty.
 */
function level(v: number): number {
  if (v <= 0 || max.value <= 0) return 0
  // sqrt because spend is heavily skewed — a linear scale renders every hour
  // except the peak as the same near-black square
  const ratio = Math.sqrt(v / max.value)
  return Math.min(4, Math.floor(ratio * 4) + 1)
}

/**
 * Written out in full, not derived.
 *
 * Tailwind scans source text for complete class names — a class assembled at
 * runtime (`'chart-1/' + step`, or a `.replace()` on a base string) is never
 * seen by the compiler and silently produces an uncoloured grid.
 */
const LEVEL_CLASS = [
  'bg-muted',
  'bg-chart-1/25',
  'bg-chart-1/50',
  'bg-chart-1/75',
  'bg-chart-1',
] as const

const grid = computed(() => {
  const byKey = new Map(props.cells.map(c => [`${c.weekday}:${c.hour}`, c]))
  return DAYS.map((day, weekday) => ({
    day,
    weekday,
    hours: Array.from({ length: 24 }, (_, hour) => {
      const cell = byKey.get(`${weekday}:${hour}`) ?? { weekday, hour, costUsd: 0, tokens: 0, events: 0 }
      return { ...cell, level: level(value(cell)) }
    }),
  }))
})

const label = (cell: { weekday: number, hour: number, costUsd: number, tokens: number, events: number }) => {
  const when = `${DAYS[cell.weekday]} ${String(cell.hour).padStart(2, '0')}:00`
  if (props.metric === 'cost') return `${when} — ${formatUsd(cell.costUsd)}`
  if (props.metric === 'tokens') return `${when} — ${formatCompact(cell.tokens)} tokens`
  return `${when} — ${cell.events} events`
}
</script>

<template>
  <div :class="cn('w-full', props.class)">
    <div class="flex gap-1">
      <!-- weekday gutter -->
      <div class="text-muted-foreground flex shrink-0 flex-col justify-around pr-1 text-[10px]">
        <span v-for="row in grid" :key="row.day" class="h-3 leading-3">{{ row.day }}</span>
      </div>

      <div class="min-w-0 flex-1">
        <div class="flex flex-col gap-[3px]">
          <div v-for="row in grid" :key="row.day" class="flex gap-[3px]">
            <div
              v-for="cell in row.hours"
              :key="cell.hour"
              class="group relative h-3 flex-1 rounded-[2px]"
              :class="LEVEL_CLASS[cell.level]"
              :title="label(cell)"
            />
          </div>
        </div>

        <!-- hour axis: every third hour, so labels never collide -->
        <div class="text-muted-foreground mt-1.5 flex text-[10px]">
          <span
            v-for="hour in [0, 3, 6, 9, 12, 15, 18, 21]"
            :key="hour"
            class="flex-1 tabular"
          >{{ String(hour).padStart(2, '0') }}</span>
        </div>
      </div>
    </div>

    <div class="text-muted-foreground mt-3 flex items-center justify-end gap-1.5 text-[10px]">
      <span>less</span>
      <span v-for="(cls, i) in LEVEL_CLASS" :key="i" class="size-3 rounded-[2px]" :class="cls" />
      <span>more</span>
    </div>
  </div>
</template>
