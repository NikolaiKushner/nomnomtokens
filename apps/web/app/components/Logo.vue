<script setup lang="ts">
import { cn } from '~/lib/utils'

withDefaults(
  defineProps<{
    size?: number
    showWordmark?: boolean
    class?: string
  }>(),
  { size: 18, showWordmark: true },
)
</script>

<template>
  <span :class="cn('inline-flex items-center gap-2', $props.class)">
    <CookieMark :size="size" class="text-foreground" />
    <span
      v-if="showWordmark"
      class="text-sm font-semibold tracking-tight sm:text-[15px]"
    >
      <span>nomnom</span><span class="text-muted-foreground font-medium">tokens</span>
    </span>
  </span>
</template>
