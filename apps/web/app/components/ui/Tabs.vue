<script setup lang="ts">
import { cn } from '~/lib/utils'

/**
 * A segmented control with shadcn's tab styling and full keyboard support
 * (arrows, Home/End) implemented against the WAI-ARIA tabs pattern. Used for
 * the cost / volume / sessions metric toggle, which is the single most-clicked
 * control in the app.
 */
const props = defineProps<{
  options: Array<{ value: string, label: string }>
  class?: string
  ariaLabel?: string
}>()

const model = defineModel<string>({ required: true })

function onKeydown(event: KeyboardEvent, index: number) {
  const last = props.options.length - 1
  let next: number | null = null

  if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1
  else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = last
  if (next === null) return

  event.preventDefault()
  model.value = props.options[next]!.value
  const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll('[role=tab]')
  ;(tabs?.[next] as HTMLElement | undefined)?.focus()
}
</script>

<template>
  <div
    role="tablist"
    :aria-label="props.ariaLabel"
    data-slot="tabs-list"
    :class="cn(
      'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]',
      props.class,
    )"
  >
    <button
      v-for="(opt, i) in props.options"
      :key="opt.value"
      type="button"
      role="tab"
      :aria-selected="model === opt.value"
      :tabindex="model === opt.value ? 0 : -1"
      :data-state="model === opt.value ? 'active' : 'inactive'"
      data-slot="tabs-trigger"
      :class="cn(
        'inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:outline-1 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-background data-[state=active]:shadow-sm dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 data-[state=active]:text-foreground',
        `[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0`,
      )"
      @click="model = opt.value"
      @keydown="onKeydown($event, i)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
