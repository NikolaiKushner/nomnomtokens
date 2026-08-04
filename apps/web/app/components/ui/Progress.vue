<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<{
    /** 0-100; values above 100 clamp so an over-limit bar doesn't overflow its track */
    value?: number
    class?: string
    indicatorClass?: string
  }>(),
  { value: 0 },
)

const clamped = computed(() => Math.max(0, Math.min(100, props.value)))
</script>

<template>
  <div
    data-slot="progress"
    role="progressbar"
    :aria-valuenow="Math.round(props.value)"
    aria-valuemin="0"
    aria-valuemax="100"
    :class="cn('bg-primary/20 relative h-2 w-full overflow-hidden rounded-full', props.class)"
  >
    <div
      data-slot="progress-indicator"
      :class="cn('bg-primary h-full w-full flex-1 transition-all', props.indicatorClass)"
      :style="{ transform: `translateX(-${100 - clamped}%)` }"
    />
  </div>
</template>
