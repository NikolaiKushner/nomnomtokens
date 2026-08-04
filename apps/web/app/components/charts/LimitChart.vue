<script setup lang="ts">
import { VisAxis, VisCrosshair, VisLine, VisScatter, VisTooltip, VisXYContainer } from '@unovis/vue'
import { cn } from '~/lib/utils'

/**
 * Window-fill history with the burn-rate projection drawn past the last
 * sample, plus markers for the moments the cap was actually hit.
 *
 * The projection is a second line rather than a dashed continuation of the
 * first, because "measured" and "predicted" must not look like the same claim.
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

interface Point { x: number, measured: number | null, projected: number | null }

const data = computed<Point[]>(() => {
  const points: Point[] = props.snapshots.map(s => ({ x: s.ts, measured: s.usedPct, projected: null }))
  const last = props.snapshots[props.snapshots.length - 1]

  if (last && props.forecast?.exhaustsAt) {
    // anchor the projection on the last measurement so the two lines meet
    points.push({ x: last.ts, measured: last.usedPct, projected: last.usedPct })
    points.push({ x: props.forecast.exhaustsAt, measured: null, projected: 100 })
  }
  return points
})

const hitPoints = computed(() => props.hits.map(ts => ({ x: ts, y: 100 })))

const x = (d: Point) => d.x
const y = [(d: Point) => d.measured, (d: Point) => d.projected]
const color = (_: unknown, i: number) => (i === 0 ? 'var(--chart-1)' : 'var(--destructive)')

function template(d: Point): string {
  const value = d.measured ?? d.projected ?? 0
  const kind = d.measured === null ? 'projected' : 'measured'
  return `
    <div class="bg-popover text-popover-foreground rounded-md border p-2.5 text-xs shadow-md">
      <div class="font-medium">${formatDateTime(d.x)}</div>
      <div class="text-muted-foreground">${value.toFixed(1)}% used <span class="opacity-70">(${kind})</span></div>
    </div>`
}
</script>

<template>
  <ClientOnly>
    <VisXYContainer
      :data="data"
      :height="props.height"
      :y-domain="[0, 100]"
      :margin="{ top: 8, right: 8, bottom: 24, left: 36 }"
      :class="cn('chart-surface w-full', props.class)"
    >
      <VisLine :x="x" :y="y" :color="color" :line-width="2" curve-type="monotoneX" />
      <VisScatter :x="(d: { x: number }) => d.x" :y="(d: { y: number }) => d.y" :data="hitPoints" color="var(--destructive)" :size="7" />
      <VisAxis type="x" :tick-format="(t: number) => formatDate(t)" :num-ticks="5" :grid-line="false" :domain-line="false" />
      <VisAxis type="y" :tick-format="(v: number) => `${v}%`" :num-ticks="3" :domain-line="false" />
      <VisCrosshair :template="template" />
      <VisTooltip />
    </VisXYContainer>

    <template #fallback>
      <UiSkeleton :style="{ height: `${props.height}px` }" class="w-full" />
    </template>
  </ClientOnly>
</template>
