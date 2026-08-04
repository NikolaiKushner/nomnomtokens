<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

/**
 * A native <select> wearing shadcn's trigger styles.
 *
 * shadcn's Select is a headless popover; ours is the platform control. For a
 * dashboard that must be fully keyboard-operable this is a feature, not a
 * compromise — type-ahead, Home/End and screen-reader semantics come for free
 * and cost no JavaScript.
 */
const props = defineProps<{
  options: Array<{ value: string, label: string }>
  class?: string
  ariaLabel?: string
}>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="relative">
    <select
      v-model="model"
      data-slot="select"
      :aria-label="props.ariaLabel"
      :class="cn(
        'border-input dark:bg-input/30 flex h-9 w-full appearance-none items-center rounded-md border bg-transparent py-2 pr-8 pl-3 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )"
    >
      <option v-for="opt in props.options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </option>
    </select>
    <ChevronDown class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-50" />
  </div>
</template>
