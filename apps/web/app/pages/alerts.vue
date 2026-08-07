<script setup lang="ts">
useHead({ title: 'Alerts — nomnomtokens' })

interface AlertsPayload {
  config: {
    limitPct: number | null
    dailyUsd: number | null
    webhook: string | null
    desktopNotify: boolean
  }
  path: string
  exists: boolean
  hits: Array<{ id: string, kind: string, message: string, value: number, threshold: number }>
  todayCostUsd: number
}

const { data, pending, refresh } = await useFetch<AlertsPayload>('/api/alerts', {
  key: 'alerts',
})

const limitPct = ref<string>('')
const dailyUsd = ref<string>('')
const webhook = ref('')
const desktopNotify = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

watch(data, (v) => {
  if (!v) return
  limitPct.value = v.config.limitPct === null ? '' : String(v.config.limitPct)
  dailyUsd.value = v.config.dailyUsd === null ? '' : String(v.config.dailyUsd)
  webhook.value = v.config.webhook ?? ''
  desktopNotify.value = v.config.desktopNotify
}, { immediate: true })

async function save() {
  saving.value = true
  error.value = null
  try {
    const limit = limitPct.value.trim() === '' ? null : Number(limitPct.value)
    const daily = dailyUsd.value.trim() === '' ? null : Number(dailyUsd.value)
    if (limit !== null && !Number.isFinite(limit)) throw new Error('limit % must be a number')
    if (daily !== null && !Number.isFinite(daily)) throw new Error('daily $ must be a number')

    await $fetch('/api/alerts', {
      method: 'PUT',
      body: {
        limitPct: limit,
        dailyUsd: daily,
        webhook: webhook.value.trim() || null,
        desktopNotify: desktopNotify.value,
      },
    })
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Alerts</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Thresholds for limit windows and daily spend. Checked on Overview, via
        <span class="font-mono">nnt alerts check</span>, and optionally a webhook.
      </p>
    </div>

    <UiCard v-if="(data?.hits.length ?? 0) > 0">
      <UiCardHeader>
        <UiCardTitle class="text-destructive">Firing</UiCardTitle>
        <UiCardDescription>Crossed right now against the local store.</UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-2">
        <p v-for="hit in data!.hits" :key="hit.id" class="text-sm">
          {{ hit.message }}
        </p>
      </UiCardContent>
    </UiCard>

    <UiCard>
      <UiCardHeader>
        <UiCardTitle>Thresholds</UiCardTitle>
        <UiCardDescription>
          Stored at <span class="font-mono">{{ data?.path ?? '~/.nomnomtokens/alerts.json' }}</span>.
          Leave a field empty to disable it.
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="space-y-1.5 text-sm">
            <span class="text-muted-foreground">Limit window ≥ %</span>
            <input
              v-model="limitPct"
              type="number"
              min="0"
              max="100"
              step="1"
              placeholder="80"
              class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
            >
          </label>
          <label class="space-y-1.5 text-sm">
            <span class="text-muted-foreground">Daily spend ≥ USD</span>
            <input
              v-model="dailyUsd"
              type="number"
              min="0"
              step="0.01"
              placeholder="off"
              class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
            >
          </label>
        </div>

        <label class="space-y-1.5 text-sm">
          <span class="text-muted-foreground">Webhook URL (optional)</span>
          <input
            v-model="webhook"
            type="url"
            placeholder="https://…"
            class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 font-mono text-sm outline-none focus-visible:ring-[3px]"
          >
        </label>

        <label class="flex items-center gap-2 text-sm">
          <input v-model="desktopNotify" type="checkbox" class="size-4 rounded border">
          Desktop notification on <span class="font-mono">nnt alerts check --notify</span>
        </label>

        <div class="flex flex-wrap items-center gap-3">
          <UiButton :disabled="saving || pending" @click="save">
            {{ saving ? 'Saving…' : 'Save' }}
          </UiButton>
          <p class="text-muted-foreground text-xs">
            Today so far: {{ formatUsd(data?.todayCostUsd) }}
          </p>
        </div>
        <p v-if="error" class="text-destructive text-sm">{{ error }}</p>
      </UiCardContent>
    </UiCard>
  </div>
</template>
