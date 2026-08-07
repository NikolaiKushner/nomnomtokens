<script setup lang="ts">
useHead({ title: 'Export — nomnomtokens' })

const filters = useFilters()
const format = ref<'csv' | 'json'>('csv')

const href = computed(() => {
  const q = new URLSearchParams()
  q.set('format', format.value)
  q.set('range', filters.range.value)
  if (filters.scopes.value.length) q.set('scope', filters.scopes.value.join(','))
  if (filters.providers.value.length) q.set('provider', filters.providers.value.join(','))
  return `/api/export?${q.toString()}`
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Export</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Download the current filter set as a spreadsheet or JSON. Same rows as
        <span class="font-mono">nnt export</span>.
      </p>
    </div>

    <FilterBar />

    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Download</UiCardTitle>
        <UiCardDescription>
          Respects the range and project chips above. Cap is 100 000 events per file.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-4">
        <UiTabs
          :model-value="format"
          :options="[
            { value: 'csv', label: 'CSV' },
            { value: 'json', label: 'JSON' },
          ]"
          aria-label="Export format"
          @update:model-value="format = $event as 'csv' | 'json'"
        />

        <div class="flex flex-wrap items-center gap-3">
          <UiButton :href="href">
            Download {{ format.toUpperCase() }}
          </UiButton>
          <p class="text-muted-foreground text-xs">
            CLI: <span class="font-mono">nnt export --format {{ format }} -o out.{{ format }}</span>
          </p>
        </div>
      </UiCardContent>
    </UiCard>
  </div>
</template>
