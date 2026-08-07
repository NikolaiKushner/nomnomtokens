<script setup lang="ts">
import { ArrowDown, ArrowUp, Minus } from 'lucide-vue-next'

useHead({ title: 'Projects — nomnomtokens' })

const { data, pending } = useScopeStats()
const filters = useFilters()

const total = computed(() => (data.value?.rows ?? []).reduce((s, r) => s + r.costUsd, 0))
const share = (cost: number) => (total.value > 0 ? (cost / total.value) * 100 : 0)

/** Same folder name can come from different absolute paths (and providers). */
function displayName(row: { label: string | null, scopeHash: string }): string {
  const base = row.label?.trim() || row.scopeHash
  const dupes = (data.value?.rows ?? []).filter(r => (r.label?.trim() || r.scopeHash) === base)
  if (dupes.length <= 1) return base
  return `${base} · ${row.scopeHash.slice(0, 6)}`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        What the agent cost per project. Click a row to focus every screen on it
        (including this table). Clear the chip above to see all again.
      </p>
    </div>

    <FilterBar />

    <p class="text-muted-foreground text-xs leading-relaxed">
      Each row is a distinct folder on disk, identified by a hash of its full path
      (we never store the path itself). The name is only the last path segment, so
      several rows can share a label like <span class="font-mono">rowkit</span> or
      <span class="font-mono">app</span> when you have clones, worktrees, or similarly
      named directories. The short suffix after · disambiguates them — these are not
      sessions. Filtering applies to that one folder, not every row with the same name.
    </p>

    <UiCard class="py-0">
      <UiTable container-class="rounded-xl">
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="pl-4">Project</UiTableHead>
            <UiTableHead numeric>Cost</UiTableHead>
            <UiTableHead numeric>Share</UiTableHead>
            <UiTableHead numeric>Trend</UiTableHead>
            <UiTableHead numeric>Tokens</UiTableHead>
            <UiTableHead numeric>Cache</UiTableHead>
            <UiTableHead numeric class="pr-4">Sessions</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-if="pending && !data">
            <UiTableCell colspan="7" class="p-4">
              <UiSkeleton class="h-24 w-full" />
            </UiTableCell>
          </UiTableRow>

          <UiTableRow v-else-if="(data?.rows.length ?? 0) === 0">
            <UiTableCell colspan="7">
              <EmptyState
                title="No projects in this range"
                description="Widen the range, or run a scan to pick up more history."
                command="npx nomnomtokens scan"
              />
            </UiTableCell>
          </UiTableRow>

          <UiTableRow
            v-for="row in data?.rows"
            :key="row.scopeHash"
            clickable
            :selected="filters.scopes.value.includes(row.scopeHash)"
            @click="filters.toggleScope(row.scopeHash)"
          >
            <UiTableCell class="pl-4 font-medium">
              {{ displayName(row) }}
              <span v-if="!row.label" class="text-muted-foreground ml-1 font-mono text-xs">unlabelled</span>
            </UiTableCell>
            <UiTableCell numeric>{{ formatUsd(row.costUsd) }}</UiTableCell>
            <UiTableCell numeric class="w-32">
              <div class="flex items-center justify-end gap-2">
                <UiProgress :value="share(row.costUsd)" class="h-1.5 w-16" />
                <span class="text-muted-foreground w-10 text-right">{{ formatPct(share(row.costUsd)) }}</span>
              </div>
            </UiTableCell>
            <UiTableCell numeric>
              <span
                v-if="row.trendPct !== null"
                class="inline-flex items-center gap-1"
                :class="row.trendPct > 5 ? 'text-destructive' : row.trendPct < -5 ? 'text-success' : 'text-muted-foreground'"
              >
                <ArrowUp v-if="row.trendPct > 5" class="size-3" />
                <ArrowDown v-else-if="row.trendPct < -5" class="size-3" />
                <Minus v-else class="size-3" />
                {{ formatPct(Math.abs(row.trendPct)) }}
              </span>
              <span v-else class="text-muted-foreground">—</span>
            </UiTableCell>
            <UiTableCell numeric>{{ formatCompact(row.tokens) }}</UiTableCell>
            <UiTableCell numeric>{{ formatRatio(row.cacheHitRate) }}</UiTableCell>
            <UiTableCell numeric class="pr-4">{{ row.sessions }}</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <p v-if="data && !data.hasTrend" class="text-muted-foreground text-xs">
      Trend needs a preceding period of equal length — pick a bounded range to see it.
    </p>
  </div>
</template>
