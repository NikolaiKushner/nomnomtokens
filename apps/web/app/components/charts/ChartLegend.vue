<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{
  items: string[]
  class?: string
  /** currently hidden series, for click-to-toggle */
  hidden?: string[]
}>()

const emit = defineEmits<{ toggle: [name: string] }>()
</script>

<template>
  <div :class="cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', props.class)">
    <button
      v-for="(item, i) in props.items"
      :key="item"
      type="button"
      class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex items-center gap-1.5 rounded text-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
      :class="props.hidden?.includes(item) && 'opacity-40'"
      @click="emit('toggle', item)"
    >
      <span class="size-2.5 rounded-[3px]" :style="{ background: `var(--chart-${(i % 8) + 1})` }" />
      <span class="font-mono">{{ item }}</span>
    </button>
  </div>
</template>
