<script setup lang="ts">
useHead({ title: 'Import — nomnomtokens' })

const provider = ref('csv')
const kind = ref('tokens')
const busy = ref(false)
const message = ref<string | null>(null)
const error = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  await upload(file)
  input.value = ''
}

async function upload(file: File) {
  busy.value = true
  message.value = null
  error.value = null
  try {
    const body = new FormData()
    body.set('file', file)
    body.set('provider', provider.value.trim() || 'csv')
    body.set('kind', kind.value.trim() || 'tokens')
    const res = await $fetch<{ added: number, events: number, duplicates: number, scopes: number }>(
      '/api/import/csv',
      { method: 'POST', body },
    )
    message.value = `Imported ${res.added} new event(s) `
      + `(${res.events} in file, ${res.duplicates} already known, ${res.scopes} scope(s)).`
    await refreshNuxtData()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function onDrop(event: DragEvent) {
  event.preventDefault()
  const file = event.dataTransfer?.files?.[0]
  if (file) void upload(file)
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-semibold tracking-tight">Import CSV</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Drop a billing export or spreadsheet. Headers like
        <span class="font-mono">timestamp</span>,
        <span class="font-mono">cost</span>,
        <span class="font-mono">model</span>,
        <span class="font-mono">project</span>,
        <span class="font-mono">input_tokens</span> /
        <span class="font-mono">output_tokens</span> are detected automatically.
      </p>
    </div>

    <UiCard>
      <UiCardHeader>
        <UiCardTitle>File</UiCardTitle>
        <UiCardDescription>
          Re-importing the same rows is safe — each row hashes to a stable id.
          CLI: <span class="font-mono">nnt import path/to/file.csv</span>
        </UiCardDescription>
      </UiCardHeader>
      <UiCardContent class="space-y-4">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="space-y-1.5 text-sm">
            <span class="text-muted-foreground">Provider label</span>
            <input
              v-model="provider"
              class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
              placeholder="csv"
            >
          </label>
          <label class="space-y-1.5 text-sm">
            <span class="text-muted-foreground">Kind</span>
            <input
              v-model="kind"
              class="border-input bg-background focus-visible:ring-ring/50 flex h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-[3px]"
              placeholder="tokens"
            >
          </label>
        </div>

        <div
          class="border-muted-foreground/40 hover:border-foreground/40 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors"
          @dragover.prevent
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <p class="text-sm font-medium">Drop a .csv here, or click to choose</p>
          <p class="text-muted-foreground text-xs">UTF-8 text · first row = headers</p>
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv,text/plain"
            class="hidden"
            :disabled="busy"
            @change="onFile"
          >
        </div>

        <p v-if="busy" class="text-muted-foreground text-sm">Importing…</p>
        <p v-else-if="message" class="text-sm text-success">{{ message }}</p>
        <p v-else-if="error" class="text-destructive text-sm">{{ error }}</p>
      </UiCardContent>
    </UiCard>
  </div>
</template>
