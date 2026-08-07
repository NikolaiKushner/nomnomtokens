<script setup lang="ts">
import { cn } from '~/lib/utils'

withDefaults(
  defineProps<{
    size?: number
    class?: string
  }>(),
  { size: 18 },
)
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :class="cn('shrink-0', $props.class)"
    aria-hidden="true"
  >
    <!-- round cookie with a bite from the upper-right -->
    <path d="M12 3a9 9 0 1 0 9 9c0-1.1-.2-2.15-.55-3.1A2.9 2.9 0 0 1 17.1 11a2.9 2.9 0 0 1-2.9-2.9c0-.9.4-1.7 1.05-2.25A8.9 8.9 0 0 0 12 3z" />
    <circle cx="8.5" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="13" cy="9" r="0.85" fill="currentColor" stroke="none" />
    <circle cx="10" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="14.5" cy="13.5" r="0.8" fill="currentColor" stroke="none" />
  </svg>
</template>
