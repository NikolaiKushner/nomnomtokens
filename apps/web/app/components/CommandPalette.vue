<script setup lang="ts">
import { ArrowRight, Folder, Search } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

/**
 * ⌘K navigation.
 *
 * Built on <dialog>, which gives focus trapping, Escape-to-close, inert
 * background and the top layer without a single line of focus-management code.
 * The list is a listbox with roving `aria-activedescendant`.
 */
const emit = defineEmits<{ close: [] }>()
const props = defineProps<{ open: boolean }>()

const router = useRouter()
const filters = useFilters()
const { scopes } = useScopes()

const dialog = ref<HTMLDialogElement>()
const query = ref('')
const active = ref(0)

interface Command {
  id: string
  label: string
  hint?: string
  group: string
  run: () => void
}

const commands = computed<Command[]>(() => {
  const pages: Command[] = [
    { id: 'nav-overview', label: 'Overview', group: 'Go to', run: () => router.push('/') },
    { id: 'nav-timeline', label: 'Timeline', group: 'Go to', run: () => router.push('/timeline') },
    { id: 'nav-scopes', label: 'Projects', group: 'Go to', run: () => router.push('/scopes') },
    { id: 'nav-providers', label: 'Providers', group: 'Go to', run: () => router.push('/providers') },
    { id: 'nav-sessions', label: 'Sessions', group: 'Go to', run: () => router.push('/sessions') },
    { id: 'nav-limits', label: 'Limits', group: 'Go to', run: () => router.push('/limits') },
  ]

  const ranges: Command[] = ([
    ['24h', 'Last 24 hours'],
    ['7d', 'Last 7 days'],
    ['30d', 'Last 30 days'],
    ['all', 'All time'],
  ] as const).map(([value, label]) => ({
    id: `range-${value}`,
    label,
    group: 'Range',
    run: () => filters.setRange(value),
  }))

  const projects: Command[] = scopes.value.map(s => ({
    id: `scope-${s.scopeHash}`,
    label: s.label,
    hint: 'filter to this project',
    group: 'Projects',
    run: () => filters.toggleScope(s.scopeHash),
  }))

  const clear: Command[] = filters.hasScopeFilter.value
    ? [{ id: 'clear', label: 'Clear project filter', group: 'Range', run: () => filters.clearScopes() }]
    : []

  return [...pages, ...ranges, ...clear, ...projects]
})

const results = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return commands.value.slice(0, 12)
  // subsequence match, so "ovw" finds "Overview" the way a fuzzy finder would
  return commands.value
    .filter((cmd) => {
      const haystack = `${cmd.group} ${cmd.label}`.toLowerCase()
      let i = 0
      for (const ch of q) {
        i = haystack.indexOf(ch, i)
        if (i === -1) return false
        i += 1
      }
      return true
    })
    .slice(0, 12)
})

const grouped = computed(() => {
  const map = new Map<string, Command[]>()
  for (const cmd of results.value) {
    const list = map.get(cmd.group) ?? []
    list.push(cmd)
    map.set(cmd.group, list)
  }
  return [...map.entries()]
})

watch(results, () => { active.value = 0 })

watch(() => props.open, (open) => {
  if (open) {
    query.value = ''
    active.value = 0
    nextTick(() => dialog.value?.showModal())
  } else {
    dialog.value?.close()
  }
})

function run(cmd: Command | undefined) {
  if (!cmd) return
  cmd.run()
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    active.value = (active.value + 1) % Math.max(results.value.length, 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    active.value = (active.value - 1 + results.value.length) % Math.max(results.value.length, 1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    run(results.value[active.value])
  }
}

const flatIndex = (group: string, i: number) =>
  grouped.value.slice(0, grouped.value.findIndex(([g]) => g === group)).reduce((n, [, list]) => n + list.length, 0) + i
</script>

<template>
  <dialog
    ref="dialog"
    class="bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-in"
    aria-label="Command palette"
    @close="emit('close')"
    @click.self="emit('close')"
  >
    <div
      class="bg-popover text-popover-foreground mt-[15vh] w-[min(90vw,34rem)] overflow-hidden rounded-xl border shadow-lg"
      @keydown="onKeydown"
    >
      <div class="flex items-center gap-2 border-b px-3">
        <Search class="text-muted-foreground size-4 shrink-0" />
        <input
          v-model="query"
          autofocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          :aria-activedescendant="`command-${active}`"
          placeholder="Jump to a page, range or project…"
          class="placeholder:text-muted-foreground h-11 w-full bg-transparent text-sm outline-none"
        >
        <UiKbd>esc</UiKbd>
      </div>

      <ul id="command-results" role="listbox" class="max-h-80 overflow-y-auto p-1">
        <li v-if="results.length === 0" class="text-muted-foreground p-6 text-center text-sm">
          Nothing matches “{{ query }}”.
        </li>

        <template v-for="[group, items] in grouped" :key="group">
          <li class="text-muted-foreground px-2 pt-3 pb-1 text-xs font-medium">{{ group }}</li>
          <li
            v-for="(cmd, i) in items"
            :id="`command-${flatIndex(group, i)}`"
            :key="cmd.id"
            role="option"
            :aria-selected="active === flatIndex(group, i)"
            :class="cn(
              'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
              active === flatIndex(group, i) && 'bg-accent text-accent-foreground',
            )"
            @click="run(cmd)"
            @mousemove="active = flatIndex(group, i)"
          >
            <Folder v-if="cmd.group === 'Projects'" class="size-4 opacity-60" />
            <ArrowRight v-else class="size-4 opacity-60" />
            <span class="truncate">{{ cmd.label }}</span>
            <span v-if="cmd.hint" class="text-muted-foreground ml-auto text-xs">{{ cmd.hint }}</span>
          </li>
        </template>
      </ul>
    </div>
  </dialog>
</template>
