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

const { data } = await useFetch<AlertsPayload>('/api/alerts', {
  key: 'alerts',
})

const limitOn = ref(true)
const limitPct = ref('80')
const dailyOn = ref(false)
const dailyUsd = ref('25')
const webhook = ref('')
const desktopNotify = ref(false)

const saving = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)
const hydrated = ref(false)

watch(data, (v) => {
  if (!v || saving.value) return
  limitOn.value = v.config.limitPct !== null
  limitPct.value = String(v.config.limitPct ?? 80)
  dailyOn.value = v.config.dailyUsd !== null
  dailyUsd.value = String(v.config.dailyUsd ?? 25)
  webhook.value = v.config.webhook ?? ''
  desktopNotify.value = v.config.desktopNotify
  hydrated.value = true
}, { immediate: true })

function errMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { data?: { statusMessage?: string, message?: string }, message?: string }
    if (e.data?.statusMessage) return e.data.statusMessage
    if (e.data?.message) return e.data.message
    if (typeof e.message === 'string') return e.message
  }
  return String(err)
}

/** Accept "12.5" / "12,5" / numbers from stubborn number inputs. */
function parseAmount(raw: unknown): number {
  const s = String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.')
  return Number(s)
}

async function save() {
  message.value = null
  error.value = null

  let limit: number | null = null
  let daily: number | null = null

  if (limitOn.value) {
    limit = parseAmount(limitPct.value)
    if (!Number.isFinite(limit) || limit < 0 || limit > 100) {
      error.value = 'Limit threshold must be a number from 0 to 100.'
      return
    }
  }
  if (dailyOn.value) {
    daily = parseAmount(dailyUsd.value)
    if (!Number.isFinite(daily) || daily < 0) {
      error.value = 'Daily spend threshold must be a non-negative number.'
      return
    }
  }

  saving.value = true
  try {
    const res = await $fetch<AlertsPayload>('/api/alerts', {
      method: 'PUT',
      body: {
        limitPct: limit,
        dailyUsd: daily,
        webhook: String(webhook.value ?? '').trim() || null,
        desktopNotify: desktopNotify.value,
      },
    })
    // Apply server response directly so the form does not flash empty.
    data.value = res
    message.value = res.hits.length > 0
      ? `Saved · ${res.hits.length} alert(s) firing now`
      : 'Saved · no alerts firing'
    await refreshNuxtData('overview-alerts')
  } catch (err) {
    error.value = errMessage(err)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p class="text-muted-foreground mt-1 max-w-xl text-sm">
          Warn when a limit window fills up or today’s spend crosses a dollar line.
          Checked on Overview and with
          <span class="font-mono">nnt alerts check</span>.
        </p>
      </div>
      <div class="text-right">
        <p class="text-muted-foreground text-xs tracking-wide uppercase">Today so far</p>
        <p class="tabular text-2xl font-semibold tracking-tight">
          {{ formatUsd(data?.todayCostUsd) }}
        </p>
      </div>
    </div>

    <div
      v-if="(data?.hits.length ?? 0) > 0"
      class="border-destructive/30 bg-destructive/5 space-y-2 rounded-xl border px-4 py-3"
    >
      <p class="text-destructive text-sm font-medium">Firing now</p>
      <ul class="space-y-1">
        <li v-for="hit in data!.hits" :key="hit.id" class="text-sm">
          {{ hit.message }}
        </li>
      </ul>
    </div>

    <form class="space-y-6" @submit.prevent="save">
      <div class="divide-border divide-y rounded-xl border">
        <div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 sm:max-w-sm">
            <label class="flex items-center gap-2.5 text-sm font-medium">
              <input
                v-model="limitOn"
                type="checkbox"
                class="border-input text-primary focus-visible:ring-ring/50 size-4 rounded border accent-primary"
              >
              Limit window
            </label>
            <p class="text-muted-foreground mt-1 pl-6 text-xs leading-relaxed">
              Fire when any provider window is at or above this fill %.
            </p>
          </div>
          <div class="flex items-center gap-2 pl-6 sm:pl-0">
            <UiInput
              v-model="limitPct"
              type="text"
              inputmode="decimal"
              :disabled="!limitOn"
              class="w-24 text-right tabular-nums"
              aria-label="Limit percent threshold"
            />
            <span class="text-muted-foreground text-sm">%</span>
          </div>
        </div>

        <div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 sm:max-w-sm">
            <label class="flex items-center gap-2.5 text-sm font-medium">
              <input
                v-model="dailyOn"
                type="checkbox"
                class="border-input text-primary focus-visible:ring-ring/50 size-4 rounded border accent-primary"
              >
              Daily spend
            </label>
            <p class="text-muted-foreground mt-1 pl-6 text-xs leading-relaxed">
              Fire when today’s priced token spend reaches this amount.
            </p>
          </div>
          <div class="flex items-center gap-2 pl-6 sm:pl-0">
            <span class="text-muted-foreground text-sm">$</span>
            <UiInput
              v-model="dailyUsd"
              type="text"
              inputmode="decimal"
              :disabled="!dailyOn"
              class="w-28 text-right tabular-nums"
              aria-label="Daily USD threshold"
            />
          </div>
        </div>

        <div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 sm:max-w-sm">
            <p class="text-sm font-medium">Webhook</p>
            <p class="text-muted-foreground mt-1 text-xs leading-relaxed">
              Optional POST when
              <span class="font-mono">nnt alerts check --notify</span> fires.
              Body is thresholds only — no paths or prompts.
            </p>
          </div>
          <UiInput
            v-model="webhook"
            type="url"
            placeholder="https://example.com/hook"
            class="font-mono sm:max-w-xs sm:flex-1"
            aria-label="Webhook URL"
          />
        </div>

        <div class="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 sm:max-w-sm">
            <label class="flex items-center gap-2.5 text-sm font-medium">
              <input
                v-model="desktopNotify"
                type="checkbox"
                class="border-input text-primary focus-visible:ring-ring/50 size-4 rounded border accent-primary"
              >
              Desktop notification
            </label>
            <p class="text-muted-foreground mt-1 pl-6 text-xs leading-relaxed">
              macOS / Linux banner from the CLI check (not from this page).
            </p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <UiButton type="submit" :disabled="saving || !hydrated">
          {{ saving ? 'Saving…' : 'Save' }}
        </UiButton>
        <p v-if="message" class="text-sm text-success">{{ message }}</p>
        <p v-else-if="error" class="text-destructive text-sm">{{ error }}</p>
        <p v-else class="text-muted-foreground text-xs">
          Written to <span class="font-mono">alerts.json</span>
        </p>
      </div>
    </form>
  </div>
</template>
