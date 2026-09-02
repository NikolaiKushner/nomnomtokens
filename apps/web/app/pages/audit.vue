<script setup lang="ts">
useHead({ title: 'Audit — nomnomtokens' })

const { data: audit, pending } = useAudit()
const { data: meta } = useMeta()
const isEmpty = computed(() => (meta.value?.bounds.events ?? 0) === 0)

function formatGap(ms: number): string {
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return formatDuration(ms)
  return `${hours}h idle`
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Audit</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Where spend went in this range — cache, subagents, models, and cold resumes.
        Same numbers as <span class="font-mono">nnt audit</span>.
      </p>
    </div>

    <FilterBar />

    <EmptyState
      v-if="isEmpty && !pending"
      title="Nothing to audit yet"
      description="Run a scan so the store has history, then this page fills in."
      command="npx nomnomtokens scan"
    />

    <template v-else>
      <AuditCard :audit="audit ?? null" :pending="pending" />

      <UiCard v-if="audit && audit.models.length">
        <UiCardHeader>
          <UiCardTitle>Models</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Model</UiTableHead>
                <UiTableHead numeric>Share</UiTableHead>
                <UiTableHead numeric>Cost</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              <UiTableRow v-for="model in audit.models" :key="model.unitLabel ?? 'unknown'">
                <UiTableCell class="font-mono text-sm">{{ model.unitLabel ?? 'unknown' }}</UiTableCell>
                <UiTableCell numeric>{{ formatPct(model.share * 100, 0) }}</UiTableCell>
                <UiTableCell numeric>{{ formatUsd(model.costUsd) }}</UiTableCell>
              </UiTableRow>
            </UiTableBody>
          </UiTable>
        </UiCardContent>
      </UiCard>

      <UiCard v-if="audit && audit.coldResumes.length">
        <UiCardHeader>
          <UiCardTitle>Cold resumes</UiCardTitle>
          <UiCardDescription>
            Large cache writes after an idle gap — usually cheaper to /clear than resume.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Session</UiTableHead>
                <UiTableHead numeric>Idle</UiTableHead>
                <UiTableHead numeric>Cache write</UiTableHead>
                <UiTableHead numeric>Turn cost</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              <UiTableRow v-for="hit in audit.coldResumes" :key="`${hit.sessionId}-${hit.ts}`">
                <UiTableCell>
                  <NuxtLink
                    :to="`/sessions/${hit.sessionId}`"
                    class="hover:underline"
                  >
                    {{ hit.label ?? hit.sessionId.slice(0, 12) }}
                  </NuxtLink>
                </UiTableCell>
                <UiTableCell numeric>{{ formatGap(hit.gapMs) }}</UiTableCell>
                <UiTableCell numeric>{{ formatCompact(hit.cacheWriteTokens) }}</UiTableCell>
                <UiTableCell numeric>{{ formatUsd(hit.costUsd) }}</UiTableCell>
              </UiTableRow>
            </UiTableBody>
          </UiTable>
        </UiCardContent>
      </UiCard>

      <UiCard v-if="audit && audit.topSessions.length">
        <UiCardHeader>
          <UiCardTitle>Top sessions</UiCardTitle>
        </UiCardHeader>
        <UiCardContent>
          <UiTable>
            <UiTableHeader>
              <UiTableRow>
                <UiTableHead>Session</UiTableHead>
                <UiTableHead numeric>Cost</UiTableHead>
                <UiTableHead numeric>Subagents</UiTableHead>
              </UiTableRow>
            </UiTableHeader>
            <UiTableBody>
              <UiTableRow v-for="s in audit.topSessions" :key="s.sessionId">
                <UiTableCell>
                  <NuxtLink :to="`/sessions/${s.sessionId}`" class="hover:underline">
                    {{ s.label ?? s.sessionId.slice(0, 12) }}
                  </NuxtLink>
                </UiTableCell>
                <UiTableCell numeric>{{ formatUsd(s.costUsd) }}</UiTableCell>
                <UiTableCell numeric>
                  {{ s.sidechainShare === null ? 'n/a' : formatRatio(s.sidechainShare) }}
                </UiTableCell>
              </UiTableRow>
            </UiTableBody>
          </UiTable>
        </UiCardContent>
      </UiCard>
    </template>
  </div>
</template>
