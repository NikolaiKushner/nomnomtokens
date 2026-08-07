<script setup lang="ts">
useHead({ title: 'Limits — nomnomtokens' })

const { data, pending } = useLimits()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Limits</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        How full the current window is. Orange is measured; red is the burn-rate
        projection to 100% if usage stays this fast.
      </p>
    </div>

    <EmptyState
      v-if="!pending && (data?.windows.length ?? 0) === 0"
      title="No limit history yet"
      description="Claude Code limits come from the status line hook (`nnt init`). Codex limits are read from session rollouts on scan."
      command="npx nomnomtokens init"
    />

    <div v-else class="space-y-6">
      <UiCard v-for="w in data?.windows" :key="`${w.provider}-${w.window}`">
        <UiCardHeader class="border-b pb-4">
          <UiCardTitle class="flex items-center gap-2">
            {{ w.window }} window
            <UiBadge variant="outline" class="font-mono">{{ w.provider }}</UiBadge>
          </UiCardTitle>
          <UiCardDescription v-if="w.forecast">
            {{ formatPct(w.forecast.usedPct, 1) }} used ·
            burning {{ w.forecast.burnRatePctPerHour.toFixed(1) }}%/h
            <template v-if="w.hits.length > 0">
              · hit the cap {{ w.hits.length }}×
            </template>
          </UiCardDescription>
          <UiCardAction>
            <Mascot :mood="w.mood" :size="40" />
          </UiCardAction>
        </UiCardHeader>

        <UiCardContent class="space-y-4 pt-5">
          <ChartsLimitChart
            :snapshots="w.snapshots"
            :hits="w.hits"
            :forecast="w.forecast"
          />

          <div v-if="w.forecast" class="grid gap-4 border-t pt-4 sm:grid-cols-3">
            <div>
              <div class="text-muted-foreground text-xs">Used</div>
              <div class="tabular mt-0.5 text-lg font-medium">{{ formatPct(w.forecast.usedPct, 1) }}</div>
            </div>
            <div>
              <div class="text-muted-foreground text-xs">Projected to hit the cap</div>
              <div class="mt-0.5 text-lg font-medium">
                {{ formatWhen(w.forecast.exhaustsAt, data!.now) }}
              </div>
            </div>
            <div>
              <div class="text-muted-foreground text-xs">Window resets</div>
              <div class="mt-0.5 text-lg font-medium">
                {{ formatWhen(w.forecast.resetsAt, data!.now) }}
              </div>
            </div>
          </div>

          <p v-if="w.forecast && w.forecast.samples < 3" class="text-muted-foreground text-xs">
            Only {{ w.forecast.samples }} samples in this window — the projection will sharpen as the
            status line fires more often.
          </p>
        </UiCardContent>
      </UiCard>
    </div>
  </div>
</template>
