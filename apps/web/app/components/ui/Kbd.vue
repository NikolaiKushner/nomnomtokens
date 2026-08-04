<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string }>()
</script>

<template>
  <kbd
    :class="cn(
      'bg-muted text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded border px-1 font-mono text-[10px] font-medium',
      props.class,
    )"
  >
    <slot />
  </kbd>
</template>
