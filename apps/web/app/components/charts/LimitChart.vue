<script setup lang="ts">
import { VisAxis, VisCrosshair, VisLine, VisScatter, VisTooltip, VisXYContainer } from '@unovis/vue'
import { cn } from '~/lib/utils'

/**
 * Current-window fill history + burn-rate projection.
 *
 * Two lines on purpose:
 *   - measured (orange) — what the status line / Codex actually reported
 *   - projected (red)   — linear burn from the latest sample to 100%
 *
 * They are separate series so "measured" and "predicted" never look like one
 * claim. Tooltip chrome is stripped (see styles below) so we don't get the
 * Unovis box nested inside our own popover.
 */
const props = withDefaults(
  defineProps<{
    snapshots: Array<{ ts: number, usedPct: number }>
    hits: number[]
    forecast: { exhaustsAt: number | null, usedPct: number, burnRatePctPerHour: number } | null
    class?: string
    height?: number
  }>(),
  { height: 220 },
)

interface Point {
  x: number
  measured: number | undefined
  projected: number | undefined
}

const data = computed<Point[]>(() => {
  const points: Point[] = props.snapshots
    .filter(s => Number.isFinite(s.ts) && Number.isFinite(s.usedPct))
    .map(s => ({ x: s.ts, measured: s.usedPct, projected: undefined }))

  const last = points[points.length - 1]
  const at = props.forecast?.exhaustsAt
  if (
    last
    && at != null
    && Number.isFinite(at)
    && (props.forecast?.burnRatePctPerHour ?? 0) > 0
  ) {
    last.projected = last.measured
    points.push({ x: at, measured: undefined, projected: 100 })
  }
  return points
})

const hasProjection = computed(() => data.value.some(d => d.projected !== undefined))

const hitPoints = computed(() =>
  props.hits.filter(ts => Number.isFinite(ts)).map(ts => ({ x: ts, y: 100 })),
)

const x = (d: Point) => d.x
// undefined (not null/0) so Unovis gaps the series instead of drawing a fake floor.
const y = [
  (d: Point) => d.measured as number,
  (d: Point) => d.projected as number,
]
const color = (_: unknown, i: number) => (i === 0 ? 'var(--chart-1)' : 'var(--destructive)')

function template(d: Point): string {
  const rows: string[] = []
  if (d.measured !== undefined) {
    rows.push(`
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-[2px]" style="background: var(--chart-1)"></span>
        <span class="flex-1">Measured</span>
        <span class="tabular font-medium">${d.measured.toFixed(1)}%</span>
      </div>`)
  }
  if (d.projected !== undefined) {
    rows.push(`
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-[2px]" style="background: var(--destructive)"></span>
        <span class="flex-1">Projected</span>
        <span class="tabular font-medium">${d.projected.toFixed(1)}%</span>
      </div>`)
  }
  return `
    <div class="bg-popover text-popover-foreground min-w-40 space-y-1.5 rounded-md border p-2.5 text-xs shadow-md">
      <div class="font-medium">${formatDateTime(d.x)}</div>
      ${rows.join('') || '<div class="text-muted-foreground">no data</div>'}
    </div>`
}

function tickDate(t: number): string {
  if (!Number.isFinite(t)) return '—'
  return formatDate(t)
}
</script>

<template>
  <div :class="cn('space-y-3', props.class)">
    <ClientOnly>
      <VisXYContainer
        :data="data"
        :height="props.height"
        :y-domain="[0, 100]"
        :margin="{ top: 8, right: 8, bottom: 24, left: 36 }"
        class="chart-surface limit-chart w-full"
      >
        <VisLine :x="x" :y="y" :color="color" :line-width="2" curve-type="monotoneX" />
        <VisScatter
          :x="(d: { x: number }) => d.x"
          :y="(d: { y: number }) => d.y"
          :data="hitPoints"
          color="var(--destructive)"
          :size="7"
        />
        <VisAxis type="x" :tick-format="tickDate" :num-ticks="5" :grid-line="false" :domain-line="false" />
        <VisAxis type="y" :tick-format="(v: number) => `${v}%`" :num-ticks="3" :domain-line="false" />
        <VisCrosshair :template="template" color="var(--foreground)" />
        <VisTooltip />
      </VisXYContainer>

      <template #fallback>
        <UiSkeleton :style="{ height: `${props.height}px` }" class="w-full" />
      </template>
    </ClientOnly>

    <div class="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span class="flex items-center gap-1.5">
        <span class="size-2.5 rounded-[3px]" style="background: var(--chart-1)" />
        Measured — actual window fill
      </span>
      <span v-if="hasProjection" class="flex items-center gap-1.5">
        <span class="bg-destructive size-2.5 rounded-[3px]" />
        Projected — if burn rate stays the same
      </span>
      <span v-if="hitPoints.length > 0" class="flex items-center gap-1.5">
        <span class="bg-destructive size-2.5 rounded-full" />
        Hit 100%
      </span>
    </div>
  </div>
</template>

<style>
.limit-chart.unovis-xy-container {
  --vis-axis-tick-color: var(--border);
  --vis-axis-tick-label-color: var(--muted-foreground);
  --vis-axis-grid-color: var(--border);
  --vis-axis-tick-label-font-size: 11px;
  --vis-crosshair-line-stroke-color: var(--muted-foreground);
  --vis-crosshair-circle-stroke-color: var(--background);
  /* Kill the default Unovis tooltip chrome — we render our own popover. */
  --vis-tooltip-background-color: transparent;
  --vis-tooltip-border-color: transparent;
  --vis-tooltip-padding: 0;
  --vis-tooltip-shadow-color: transparent;
}
</style>
