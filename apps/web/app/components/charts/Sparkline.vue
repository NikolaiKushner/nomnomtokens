<script setup lang="ts">
/**
 * Inline SVG, no library.
 *
 * A sparkline has no axes, no legend and no interaction, so a charting library
 * would add a runtime and a mount cost for a path element. It also renders on
 * the server, which matters here: this sits next to the headline number and
 * should be present in the first paint rather than popping in.
 */
const props = withDefaults(
  defineProps<{
    values: number[]
    class?: string
    /** draw as a filled area rather than a bare line */
    area?: boolean
  }>(),
  { area: true },
)

const width = 100
const height = 28

const path = computed(() => {
  const values = props.values
  if (values.length < 2) return { line: '', area: '' }

  const max = Math.max(...values)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const step = width / (values.length - 1)

  const points = values.map((v, i) => {
    const x = i * step
    // leave 1px of headroom so a peak isn't clipped by the viewBox edge
    const y = height - 1 - ((v - min) / span) * (height - 2)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  return {
    line: `M${points.join('L')}`,
    area: `M0,${height} L${points.join('L')} L${width},${height} Z`,
  }
})
</script>

<template>
  <svg
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
    :class="props.class"
    aria-hidden="true"
    focusable="false"
  >
    <path
      v-if="props.area && path.area"
      :d="path.area"
      fill="var(--chart-1)"
      opacity="0.15"
    />
    <path
      v-if="path.line"
      :d="path.line"
      fill="none"
      stroke="var(--chart-1)"
      stroke-width="1.5"
      stroke-linejoin="round"
      stroke-linecap="round"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
