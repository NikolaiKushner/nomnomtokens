<script setup lang="ts">
useHead({ title: 'Providers — nomnomtokens' })

const { data, pending } = useProviderStats()

const totalCost = computed(() => (data.value?.providers ?? []).reduce((s, p) => s + p.costUsd, 0))
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Providers</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Where spend comes from, and how efficiently each source uses its context.
      </p>
    </div>

    <FilterBar />

    <div class="grid gap-4 lg:grid-cols-3">
      <UiCard
        v-for="provider in data?.providers"
        :key="provider.provider"
        class="gap-4"
      >
        <UiCardHeader>
          <UiCardTitle class="font-mono text-base">{{ provider.provider }}</UiCardTitle>
          <UiCardDescription>
            {{ formatPct(totalCost > 0 ? (provider.costUsd / totalCost) * 100 : 0) }} of spend in range
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="space-y-4">
          <div class="tabular text-2xl font-semibold">{{ formatUsd(provider.costUsd) }}</div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted-foreground">Tokens</dt>
            <dd class="tabular text-right">{{ formatCompact(provider.tokens) }}</dd>

            <dt class="text-muted-foreground flex items-center gap-1">
              Cache hit
              <UiTooltip content="cacheRead / (cacheRead + fresh input). Higher is cheaper — reads bill at a tenth of fresh input.">
                <span class="border-muted-foreground/40 text-muted-foreground flex size-3.5 cursor-help items-center justify-center rounded-full border text-[9px]">?</span>
              </UiTooltip>
            </dt>
            <dd class="tabular text-right">{{ formatRatio(provider.cacheHitRate) }}</dd>

            <dt class="text-muted-foreground">Per 1k lines</dt>
            <dd class="tabular text-right">{{ formatUsd(provider.costPerKLines) }}</dd>

            <dt class="text-muted-foreground">Sessions</dt>
            <dd class="tabular text-right">{{ provider.sessions }}</dd>
          </dl>

          <div>
            <div class="text-muted-foreground mb-1.5 flex justify-between text-xs">
              <span>cache read</span>
              <span>fresh input</span>
            </div>
            <UiProgress
              :value="(provider.cacheHitRate ?? 0) * 100"
              class="h-1.5"
              indicator-class="bg-chart-2"
            />
          </div>
        </UiCardContent>
      </UiCard>

      <UiCard v-if="pending && !data" class="lg:col-span-3">
        <UiCardContent class="pt-6">
          <UiSkeleton class="h-40 w-full" />
        </UiCardContent>
      </UiCard>
    </div>

    <UiCard class="py-0">
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="pl-4">Model</UiTableHead>
            <UiTableHead numeric>Cost</UiTableHead>
            <UiTableHead numeric>Input</UiTableHead>
            <UiTableHead numeric>Output</UiTableHead>
            <UiTableHead numeric>Cache write</UiTableHead>
            <UiTableHead numeric>Cache read</UiTableHead>
            <UiTableHead numeric class="pr-4">Hit rate</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="model in data?.models" :key="model.unitLabel ?? 'unknown'">
            <UiTableCell class="pl-4 font-mono text-xs">
              {{ model.unitLabel ?? 'unknown' }}
            </UiTableCell>
            <UiTableCell numeric>
              {{ formatUsd(model.costUsd) }}
              <UiTooltip v-if="model.unpricedEvents > 0" content="No published price for this model id, so these events contribute tokens but no cost.">
                <UiBadge variant="outline" class="ml-1.5">unpriced</UiBadge>
              </UiTooltip>
            </UiTableCell>
            <UiTableCell numeric>{{ formatCompact(model.qtyIn) }}</UiTableCell>
            <UiTableCell numeric>{{ formatCompact(model.qtyOut) }}</UiTableCell>
            <UiTableCell numeric>
              {{ formatCompact(model.qtyCacheCreate + model.qtyCacheCreate1h) }}
            </UiTableCell>
            <UiTableCell numeric>{{ formatCompact(model.qtyCacheRead) }}</UiTableCell>
            <UiTableCell numeric class="pr-4">{{ formatRatio(model.cacheHitRate) }}</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>
  </div>
</template>
