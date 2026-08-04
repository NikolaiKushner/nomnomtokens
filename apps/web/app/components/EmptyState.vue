<script setup lang="ts">
/**
 * Meaningful empty states.
 *
 * An empty dashboard is the first thing most users see, so it has to explain
 * *why* it is empty and what to type next — not just say "no data".
 */
const props = defineProps<{
  title: string
  description?: string
  command?: string
}>()

const copied = ref(false)

async function copy() {
  if (!props.command) return
  await navigator.clipboard.writeText(props.command)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    <Mascot mood="hungry" :size="64" />
    <h2 class="mt-2 text-lg font-medium">{{ props.title }}</h2>
    <p v-if="props.description" class="text-muted-foreground max-w-md text-sm text-balance">
      {{ props.description }}
    </p>
    <button
      v-if="props.command"
      type="button"
      class="bg-muted hover:bg-accent mt-1 rounded-md px-3 py-1.5 font-mono text-xs transition-colors"
      @click="copy"
    >
      {{ copied ? 'copied' : props.command }}
    </button>
    <slot />
  </div>
</template>
