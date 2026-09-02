<script setup lang="ts">
import type { AuditReport } from '../composables/useStats'

defineProps<{
  audit: AuditReport | null
  pending?: boolean
}>()

const route = useRoute()
const auditTo = computed(() => ({ path: '/audit', query: route.query }))

function sidechainLabel(audit: AuditReport): string {
  if (!audit.sidechain.tagged) return 'n/a'
  return formatRatio(audit.sidechain.shareOfCost)
}
</script>

<template>
  <UiCard v-if="pending && !audit">
    <UiCardContent class="pt-6">
      <UiSkeleton class="h-32 w-full" />
    </UiCardContent>
  </UiCard>

  <UiCard v-else-if="audit && audit.totals.events > 0">
    <UiCardHeader>
      <UiCardTitle>Where it went</UiCardTitle>
      <UiCardDescription>
        Cache vs fresh input, subagent share, and which models ate the range.
      </UiCardDescription>
      <UiCardAction>
        <UiButton :to="auditTo" variant="ghost" size="sm">Full audit</UiButton>
      </UiCardAction>
    </UiCardHeader>
    <UiCardContent class="space-y-5">
      <dl class="grid gap-4 sm:grid-cols-3">
        <div>
          <dt class="text-muted-foreground text-xs">Cache hit</dt>
          <dd class="tabular mt-0.5 text-lg font-medium">
            {{ formatRatio(audit.cache.hitRate) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground text-xs">
            Subagents
            <span v-if="!audit.sidechain.tagged" class="text-muted-foreground/80">
              (Claude Code only)
            </span>
          </dt>
          <dd class="tabular mt-0.5 text-lg font-medium">
            {{ sidechainLabel(audit) }}
            <span
              v-if="audit.sidechain.tagged"
              class="text-muted-foreground ml-1 text-sm font-normal"
            >
              · {{ formatUsd(audit.sidechain.costUsd) }}
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-muted-foreground text-xs">Events in range</dt>
          <dd class="tabular mt-0.5 text-lg font-medium">
            {{ formatCompact(audit.totals.events) }}
          </dd>
        </div>
      </dl>

      <div v-if="audit.models.length" class="space-y-2">
        <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Models
        </p>
        <div
          v-for="model in audit.models.slice(0, 3)"
          :key="model.unitLabel ?? 'unknown'"
          class="space-y-1"
        >
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="font-mono truncate">{{ model.unitLabel ?? 'unknown' }}</span>
            <span class="text-muted-foreground tabular shrink-0">
              {{ formatPct(model.share * 100, 0) }} · {{ formatUsd(model.costUsd) }}
            </span>
          </div>
          <UiProgress :value="model.share * 100" class="h-1.5" />
        </div>
      </div>

      <div v-if="audit.coldResumes.length" class="space-y-2">
        <p class="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Cold resumes
        </p>
        <p
          v-for="hit in audit.coldResumes.slice(0, 3)"
          :key="`${hit.sessionId}-${hit.ts}`"
          class="text-sm"
        >
          {{ hit.label ?? hit.sessionId.slice(0, 12) }}
          <span class="text-muted-foreground">
            · {{ formatUsd(hit.costUsd) }} after idle
          </span>
        </p>
      </div>

      <ul v-if="audit.tips.length" class="border-border space-y-2 border-t pt-4">
        <li
          v-for="(tip, i) in audit.tips"
          :key="i"
          class="text-muted-foreground text-sm leading-relaxed"
        >
          {{ tip }}
        </li>
      </ul>
    </UiCardContent>
  </UiCard>
</template>
