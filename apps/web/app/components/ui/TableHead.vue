<script setup lang="ts">
import { cn } from '~/lib/utils'

const props = defineProps<{ class?: string, numeric?: boolean }>()
</script>

<template>
  <th
    data-slot="table-head"
    :class="cn(
      'text-foreground h-10 px-2 text-left align-middle font-medium whitespace-nowrap',
      props.numeric && 'text-right',
      props.class,
    )"
  >
    <slot />
  </th>
</template>
