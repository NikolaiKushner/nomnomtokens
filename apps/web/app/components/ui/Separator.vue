<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = withDefaults(
  defineProps<{ orientation?: 'horizontal' | 'vertical', class?: string }>(),
  { orientation: 'horizontal' },
)
</script>

<template>
  <div
    data-slot="separator"
    role="none"
    :data-orientation="props.orientation"
    :class="cn(
      'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
      props.class,
    )"
  />
</template>
