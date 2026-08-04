<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string, containerClass?: string }>()
</script>

<template>
  <div data-slot="table-container" :class="cn('relative w-full overflow-x-auto', props.containerClass)">
    <table data-slot="table" :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>
