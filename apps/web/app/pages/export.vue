<script setup lang="ts">
useHead({ title: 'Export — nomnomtokens' })

const filters = useFilters()
const format = ref<'csv' | 'json' | 'nnt'>('csv')
const client = ref('')

const href = computed(() => {
  const q = new URLSearchParams()
  q.set('format', format.value)
  q.set('range', filters.range.value)
  if (filters.scopes.value.length) q.set('scope', filters.scopes.value.join(','))
  if (filters.providers.value.length) q.set('provider', filters.providers.value.join(','))
  const tag = client.value.trim()
  if (tag && format.value !== 'nnt') q.set('client', tag)
  return `/api/export?${q.toString()}`
})
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Export</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Download the current filter set as a spreadsheet, JSON, or a portable
        nnt archive. Same rows as
        <span class="font-mono">nnt export</span>.
      </p>
    </div>

    <FilterBar />

    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Download</UiCardTitle>
        <UiCardDescription>
          CSV/JSON respect the range and project chips above. An nnt archive is
          the whole store (events, limits, labels) — treat the file as local history.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-4">
        <UiTabs
          :model-value="format"
          :options="[
            { value: 'csv', label: 'CSV' },
            { value: 'json', label: 'JSON' },
            { value: 'nnt', label: 'nnt' },
          ]"
          aria-label="Export format"
          @update:model-value="format = $event as 'csv' | 'json' | 'nnt'"
        />

        <label v-if="format !== 'nnt'" class="block max-w-xs space-y-1.5 text-sm">
          <span class="text-muted-foreground">Client tag</span>
          <input
            v-model="client"
            class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
            placeholder="optional — invoice one client"
          >
        </label>

        <div class="flex flex-wrap items-center gap-3">
          <UiButton :href="href">
            Download {{ format === 'nnt' ? 'nnt JSON' : format.toUpperCase() }}
          </UiButton>
          <p class="text-muted-foreground text-xs">
            CLI:
            <span class="font-mono">
              nnt export --format {{ format }}{{ client.trim() && format !== 'nnt' ? ` --client ${client.trim()}` : '' }} -o out.{{ format === 'nnt' ? 'json' : format }}
            </span>
          </p>
        </div>
      </UiCardContent>
    </UiCard>
  </div>
</template>
