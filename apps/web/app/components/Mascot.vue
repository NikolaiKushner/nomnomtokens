<script setup lang="ts">
import { cn } from '~/lib/utils'

/**
 * The glutton.
 *
 * This is differentiation, not decoration: the CLI-table and status-line niches
 * are taken, and "visual and characterful" is the one that isn't. The
 * expression is driven by how full the tightest limit window is, so the mascot
 * is a second readout of the same number rather than a mood ring.
 */
const props = withDefaults(
  defineProps<{ mood?: string, size?: number, class?: string }>(),
  { mood: 'content', size: 48 },
)

const FACE: Record<string, { eyes: string, mouth: string, tint: string, title: string }> = {
  hungry: { eyes: 'ᐧ ᐧ', mouth: 'ᵕ', tint: 'text-muted-foreground', title: 'The model has not been fed yet' },
  content: { eyes: '• •', mouth: '⌣', tint: 'text-chart-2', title: 'Nibbling away' },
  full: { eyes: '◕ ◕', mouth: '⌣', tint: 'text-chart-5', title: 'Getting full' },
  stuffed: { eyes: '× ×', mouth: '○', tint: 'text-chart-1', title: 'Stuffed — the cap is close' },
  overstuffed: { eyes: '⊗ ⊗', mouth: '︵', tint: 'text-destructive', title: 'Overstuffed — cap reached' },
}

const face = computed(() => FACE[props.mood] ?? FACE.content!)
</script>

<template>
  <div
    :class="cn('flex select-none flex-col items-center justify-center leading-none', face.tint, props.class)"
    :style="{ fontSize: `${props.size / 3}px` }"
    role="img"
    :aria-label="face.title"
    :title="face.title"
  >
    <span class="font-mono tracking-tight">{{ face.eyes }}</span>
    <span class="font-mono" :style="{ fontSize: `${props.size / 2.6}px` }">{{ face.mouth }}</span>
  </div>
</template>
