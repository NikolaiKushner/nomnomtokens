<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string, numeric?: boolean }>()
</script>

<template>
  <td
    data-slot="table-cell"
    :class="cn(
      'p-2 align-middle whitespace-nowrap',
      // tabular figures so a column of numbers scans as a column
      props.numeric && 'text-right tabular',
      props.class,
    )"
  >
    <slot />
  </td>
</template>
