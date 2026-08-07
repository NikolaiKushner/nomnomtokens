<script setup lang="ts">
import { cn } from '~/lib/utils'

/**
 * Hover/focus tooltip with shadcn's popover styling.
 *
 * Positioned with CSS rather than a floating-element library: every tooltip in
 * this app sits on a small control inside a scroll container, so `absolute` +
 * `translate` is sufficient and costs nothing.
 */
const props = withDefaults(
  defineProps<{ content?: string, side?: 'top' | 'bottom' | 'left' | 'right', class?: string }>(),
  { side: 'top' },
)

const sideClass = computed(() => {
  switch (props.side) {
    case 'bottom':
      return 'top-full mt-1.5 left-1/2 -translate-x-1/2'
    case 'left':
      return 'right-full mr-1.5 top-1/2 -translate-y-1/2'
    case 'right':
      return 'left-full ml-1.5 top-1/2 -translate-y-1/2'
    default:
      return 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
  }
})

const open = ref(false)
</script>

<template>
  <span
    class="relative inline-flex"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
  >
    <slot />
    <Transition
      enter-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-75"
      leave-to-class="opacity-0"
    >
      <span
        v-if="open && (props.content || $slots.content)"
        role="tooltip"
        :class="cn(
          'bg-primary text-primary-foreground pointer-events-none absolute z-50 w-max max-w-xs rounded-md px-3 py-1.5 text-xs text-balance shadow-md',
          sideClass,
          props.class,
        )"
      >
        <slot name="content">{{ props.content }}</slot>
      </span>
    </Transition>
  </span>
</template>
