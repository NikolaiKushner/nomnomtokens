<script setup lang="ts">
import { X } from 'lucide-vue-next'

/**
 * The shared filter row. Clicking a project here filters every screen, because
 * the state it edits is the URL.
 */
const filters = useFilters()
const { scopes } = useScopes()

const RANGES = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'All' },
]

const activeScopes = computed(() =>
  scopes.value.filter(s => filters.scopes.value.includes(s.scopeHash)),
)
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <UiTabs
      :model-value="filters.range.value"
      :options="RANGES"
      aria-label="Time range"
      @update:model-value="filters.setRange($event as never)"
    />

    <div v-if="activeScopes.length > 0" class="flex flex-wrap items-center gap-1.5">
      <UiBadge
        v-for="scope in activeScopes"
        :key="scope.scopeHash"
        variant="secondary"
        class="cursor-pointer gap-1 pr-1"
        @click="filters.toggleScope(scope.scopeHash)"
      >
        {{ scope.label }}
        <X class="size-3 opacity-60" />
      </UiBadge>
      <UiButton variant="ghost" size="sm" class="h-6 px-2 text-xs" @click="filters.clearScopes()">
        clear
      </UiButton>
    </div>

    <div class="ml-auto">
      <slot name="actions" />
    </div>
  </div>
</template>
