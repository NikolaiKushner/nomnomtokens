<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string, selected?: boolean, clickable?: boolean }>()
</script>

<template>
  <tr
    data-slot="table-row"
    :data-state="props.selected ? 'selected' : undefined"
    :class="cn(
      'hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors',
      props.clickable && 'cursor-pointer',
      props.class,
    )"
  >
    <slot />
  </tr>
</template>
