<script setup lang="ts">
useHead({ title: 'Sessions — nomnomtokens' })

const { data, pending } = useSessionStats()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Sessions</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Every conversation, most recent first. Open one to see how the spend accumulated.
      </p>
    </div>

    <FilterBar />

    <UiCard class="py-0">
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="pl-4">Session</UiTableHead>
            <UiTableHead>Project</UiTableHead>
            <UiTableHead>Ended</UiTableHead>
            <UiTableHead numeric>Duration</UiTableHead>
            <UiTableHead numeric>Cost</UiTableHead>
            <UiTableHead numeric>Tokens</UiTableHead>
            <UiTableHead numeric class="pr-4">Turns</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-if="pending && !data">
            <UiTableCell colspan="7" class="p-4"><UiSkeleton class="h-24 w-full" /></UiTableCell>
          </UiTableRow>

          <UiTableRow v-else-if="(data?.rows.length ?? 0) === 0">
            <UiTableCell colspan="7">
              <EmptyState
                title="No sessions in this range"
                description="Sessions appear once a scan has read your transcripts."
                command="npx nomnomtokens scan"
              />
            </UiTableCell>
          </UiTableRow>

          <UiTableRow v-for="row in data?.rows" :key="row.sessionId" clickable>
            <UiTableCell class="pl-4">
              <NuxtLink :to="`/sessions/${row.sessionId}`" class="font-mono text-xs hover:underline">
                {{ row.sessionId.slice(0, 8) }}
              </NuxtLink>
            </UiTableCell>
            <UiTableCell class="text-muted-foreground">{{ row.label ?? '—' }}</UiTableCell>
            <UiTableCell class="text-muted-foreground">{{ formatDateTime(row.endedAt) }}</UiTableCell>
            <UiTableCell numeric class="text-muted-foreground">
              {{ formatDuration(row.endedAt - row.startedAt) }}
            </UiTableCell>
            <UiTableCell numeric class="font-medium">{{ formatUsd(row.costUsd) }}</UiTableCell>
            <UiTableCell numeric>{{ formatCompact(row.tokens) }}</UiTableCell>
            <UiTableCell numeric class="pr-4">{{ row.events }}</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>
  </div>
</template>
