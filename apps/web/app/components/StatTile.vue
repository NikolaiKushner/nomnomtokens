<script setup lang="ts">
import { cn } from '~/lib/utils'

/**
 * One number, its label, and optional supporting detail.
 *
 * The value is deliberately the largest thing in the tile and uses tabular
 * figures so a row of tiles aligns on the decimal point.
 */
const props = defineProps<{
  label: string
  value: string
  hint?: string
  /** shown small and muted under the value */
  detail?: string
  loading?: boolean
  class?: string
}>()
</script>

<template>
  <UiCard :class="cn('gap-3 py-5', props.class)">
    <UiCardHeader class="px-5">
      <UiCardDescription class="flex items-center gap-1.5">
        {{ props.label }}
        <UiTooltip v-if="props.hint" :content="props.hint">
          <span class="border-muted-foreground/40 text-muted-foreground flex size-3.5 cursor-help items-center justify-center rounded-full border text-[9px]">?</span>
        </UiTooltip>
      </UiCardDescription>
    </UiCardHeader>
    <UiCardContent class="px-5">
      <UiSkeleton v-if="props.loading" class="h-8 w-24" />
      <template v-else>
        <div class="tabular text-3xl font-semibold tracking-tight">{{ props.value }}</div>
        <div v-if="props.detail" class="text-muted-foreground mt-1 text-xs">{{ props.detail }}</div>
      </template>
      <slot />
    </UiCardContent>
  </UiCard>
</template>
