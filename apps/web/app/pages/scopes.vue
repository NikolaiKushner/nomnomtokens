<script setup lang="ts">
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Minus } from 'lucide-vue-next'

useHead({ title: 'Projects — nomnomtokens' })

const { data, pending } = useScopeStats()
const filters = useFilters()

interface ProjectGroup {
  key: string
  label: string
  rows: ScopeRow[]
  costUsd: number
  tokens: number
  sessions: number
  cacheHitRate: number | null
  trendPct: number | null
}

const total = computed(() => (data.value?.rows ?? []).reduce((s, r) => s + r.costUsd, 0))
const share = (cost: number) => (total.value > 0 ? (cost / total.value) * 100 : 0)

const groups = computed<ProjectGroup[]>(() => {
  const map = new Map<string, ScopeRow[]>()
  for (const row of data.value?.rows ?? []) {
    const key = row.label?.trim() || row.scopeHash
    const list = map.get(key) ?? []
    list.push(row)
    map.set(key, list)
  }

  const out: ProjectGroup[] = []
  for (const [key, rows] of map) {
    const costUsd = rows.reduce((s, r) => s + r.costUsd, 0)
    const tokens = rows.reduce((s, r) => s + r.tokens, 0)
    const sessions = rows.reduce((s, r) => s + r.sessions, 0)
    const qtyIn = rows.reduce((s, r) => s + r.qtyIn, 0)
    const qtyCacheRead = rows.reduce((s, r) => s + r.qtyCacheRead, 0)
    const cacheDenom = qtyIn + qtyCacheRead
    const trends = rows.map(r => r.trendPct).filter((t): t is number => t !== null)
    out.push({
      key,
      label: key,
      rows: rows.sort((a, b) => b.costUsd - a.costUsd),
      costUsd,
      tokens,
      sessions,
      cacheHitRate: cacheDenom > 0 ? qtyCacheRead / cacheDenom : null,
      trendPct: trends.length ? trends.reduce((s, t) => s + t, 0) / trends.length : null,
    })
  }
  return out.sort((a, b) => b.costUsd - a.costUsd)
})

const expanded = ref<Set<string>>(new Set())

function toggleExpand(key: string) {
  const next = new Set(expanded.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expanded.value = next
}

function groupSelected(group: ProjectGroup): boolean {
  return group.rows.every(r => filters.scopes.value.includes(r.scopeHash))
    && group.rows.some(r => filters.scopes.value.includes(r.scopeHash))
}

function groupPartial(group: ProjectGroup): boolean {
  const n = group.rows.filter(r => filters.scopes.value.includes(r.scopeHash)).length
  return n > 0 && n < group.rows.length
}

function onGroupClick(group: ProjectGroup) {
  filters.toggleScopeGroup(group.rows.map(r => r.scopeHash))
}

function pathLabel(hash: string): string {
  return hash.slice(0, 6)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Projects</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Cost by folder name. Click a name to focus every screen on all paths that
        share it; expand a row to pick one clone or worktree.
      </p>
    </div>

    <FilterBar />

    <p class="text-muted-foreground text-xs leading-relaxed">
      Names are the last path segment only — we never store the full path, only a
      hash of it. Clones and worktrees with the same name are grouped here; expand
      to see each hash. Filtering a group applies to every folder in it.
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

          <UiTableRow v-else-if="groups.length === 0">
            <UiTableCell colspan="7">
              <EmptyState
                title="No projects in this range"
                description="Widen the range, or run a scan to pick up more history."
                command="npx nomnomtokens scan"
              />
            </UiTableCell>
          </UiTableRow>

          <template v-for="group in groups" :key="group.key">
            <UiTableRow
              clickable
              :selected="groupSelected(group)"
              :class="groupPartial(group) ? 'bg-muted/40' : undefined"
              @click="onGroupClick(group)"
            >
              <UiTableCell class="pl-4 font-medium">
                <span class="inline-flex items-center gap-1.5">
                  <button
                    v-if="group.rows.length > 1"
                    type="button"
                    class="text-muted-foreground hover:text-foreground -ml-1 inline-flex size-6 items-center justify-center rounded-md"
                    :aria-expanded="expanded.has(group.key)"
                    :aria-label="expanded.has(group.key) ? 'Collapse paths' : 'Expand paths'"
                    @click.stop="toggleExpand(group.key)"
                  >
                    <ChevronDown v-if="expanded.has(group.key)" class="size-3.5" />
                    <ChevronRight v-else class="size-3.5" />
                  </button>
                  <span v-else class="inline-block size-6" />
                  {{ group.label }}
                  <span
                    v-if="group.rows.length > 1"
                    class="text-muted-foreground font-normal"
                  >
                    · {{ group.rows.length }} paths
                  </span>
                </span>
              </UiTableCell>
              <UiTableCell numeric>{{ formatUsd(group.costUsd) }}</UiTableCell>
              <UiTableCell numeric class="w-32">
                <div class="flex items-center justify-end gap-2">
                  <UiProgress :value="share(group.costUsd)" class="h-1.5 w-16" />
                  <span class="text-muted-foreground w-10 text-right">{{ formatPct(share(group.costUsd)) }}</span>
                </div>
              </UiTableCell>
              <UiTableCell numeric>
                <span
                  v-if="group.trendPct !== null"
                  class="inline-flex items-center gap-1"
                  :class="group.trendPct > 5 ? 'text-destructive' : group.trendPct < -5 ? 'text-success' : 'text-muted-foreground'"
                >
                  <ArrowUp v-if="group.trendPct > 5" class="size-3" />
                  <ArrowDown v-else-if="group.trendPct < -5" class="size-3" />
                  <Minus v-else class="size-3" />
                  {{ formatPct(Math.abs(group.trendPct)) }}
                </span>
                <span v-else class="text-muted-foreground">—</span>
              </UiTableCell>
              <UiTableCell numeric>{{ formatCompact(group.tokens) }}</UiTableCell>
              <UiTableCell numeric>{{ formatRatio(group.cacheHitRate) }}</UiTableCell>
              <UiTableCell numeric class="pr-4">{{ group.sessions }}</UiTableCell>
            </UiTableRow>

            <UiTableRow
              v-for="row in (expanded.has(group.key) ? group.rows : [])"
              :key="row.scopeHash"
              clickable
              :selected="filters.scopes.value.includes(row.scopeHash)"
              class="bg-muted/20"
              @click="filters.toggleScope(row.scopeHash)"
            >
              <UiTableCell class="text-muted-foreground pl-12 font-mono text-xs">
                {{ pathLabel(row.scopeHash) }}
                <span v-if="!row.label" class="ml-1">unlabelled</span>
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
          </template>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <p v-if="data && !data.hasTrend" class="text-muted-foreground text-xs">
      Trend needs a preceding period of equal length — pick a bounded range to see it.
    </p>
  </div>
</template>
