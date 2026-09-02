<script setup lang="ts">
import {
  Activity,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  Clock,
  Download,
  FolderTree,
  Gauge,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sun,
  Upload,
  X,
} from 'lucide-vue-next'
import { cn } from '~/lib/utils'

const route = useRoute()
const { connected } = useLive()
const { data: meta } = useMeta()
const theme = useTheme()
const sidebar = useSidebar()

const THEME_ICON = { light: Sun, dark: Moon }
const THEME_LABEL = {
  light: 'Theme: light',
  dark: 'Theme: dark',
}

const paletteOpen = ref(false)
const mobileOpen = ref(false)
const sidebarHover = ref(false)

interface NavItem {
  to: string
  label: string
  icon: typeof Gauge
}

const BROWSE: NavItem[] = [
  { to: '/', label: 'Overview', icon: Gauge },
  { to: '/audit', label: 'Audit', icon: Search },
  { to: '/timeline', label: 'Timeline', icon: BarChart3 },
  { to: '/scopes', label: 'Projects', icon: FolderTree },
  { to: '/providers', label: 'Providers', icon: Boxes },
  { to: '/sessions', label: 'Sessions', icon: Clock },
  { to: '/limits', label: 'Limits', icon: Activity },
]

const TOOLS: NavItem[] = [
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/export', label: 'Export', icon: Download },
  { to: '/alerts', label: 'Alerts', icon: Bell },
]

const NAV = [...BROWSE, ...TOOLS]

const browseOpen = ref(true)
const toolsOpen = ref(true)

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

/** Keep range/project chips when hopping between screens. */
function navTo(path: string) {
  return { path, query: { ...route.query } }
}

const navIndex = (item: NavItem) => NAV.findIndex(n => n.to === item.to) + 1

const collapseLabel = computed(() =>
  sidebar.collapsed.value ? 'Expand sidebar' : 'Collapse sidebar',
)

watch(() => route.path, () => {
  mobileOpen.value = false
})

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = true
    return
  }
  if (event.key === 'Escape' && mobileOpen.value) {
    mobileOpen.value = false
    return
  }
  const target = event.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

  const index = Number.parseInt(event.key, 10)
  if (Number.isInteger(index) && index >= 1 && index <= NAV.length) {
    void navigateTo(NAV[index - 1]!.to)
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="bg-background flex min-h-screen">
    <!-- Desktop sidebar -->
    <aside
      :class="cn(
        'bg-background relative sticky top-0 z-40 hidden h-svh shrink-0 flex-col border-r transition-[width] duration-200 ease-out md:flex',
        sidebar.collapsed.value ? 'w-14' : 'w-60',
      )"
      @mouseenter="sidebarHover = true"
      @mouseleave="sidebarHover = false"
    >
      <!-- h-14 + border-b on the same box as the main header row — keeps the seam flush. -->
      <div
        :class="cn(
          'flex h-14 max-h-14 min-h-14 shrink-0 items-center overflow-hidden border-b',
          sidebar.collapsed.value ? 'justify-center px-2' : 'px-3',
        )"
      >
        <NuxtLink to="/" class="flex min-w-0 items-center" aria-label="nomnomtokens home">
          <Logo :size="20" :show-wordmark="!sidebar.collapsed.value" class="min-w-0" />
        </NuxtLink>
      </div>

      <nav class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
        <div>
          <button
            v-if="!sidebar.collapsed.value"
            type="button"
            class="text-muted-foreground hover:text-foreground mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-medium tracking-wide uppercase"
            @click="browseOpen = !browseOpen"
          >
            Browse
            <ChevronDown
              class="size-3.5 transition-transform"
              :class="browseOpen ? '' : '-rotate-90'"
            />
          </button>
          <div
            v-show="sidebar.collapsed.value || browseOpen"
            :class="cn('flex flex-col gap-0.5', sidebar.collapsed.value && 'items-center')"
          >
            <template v-for="item in BROWSE" :key="item.to">
              <UiTooltip
                v-if="sidebar.collapsed.value"
                side="right"
                :content="`${item.label} · ${navIndex(item)}`"
              >
                <NuxtLink
                  :to="navTo(item.to)"
                  :aria-label="item.label"
                  :class="cn(
                    'text-muted-foreground hover:text-foreground hover:bg-accent/50 flex size-9 items-center justify-center rounded-md transition-colors',
                    isActive(item.to) && 'bg-accent text-accent-foreground',
                  )"
                >
                  <component :is="item.icon" class="size-4" />
                </NuxtLink>
              </UiTooltip>
              <NuxtLink
                v-else
                :to="navTo(item.to)"
                :class="cn(
                  'text-muted-foreground hover:text-foreground hover:bg-accent/50 group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive(item.to) && 'bg-accent text-accent-foreground',
                )"
              >
                <component :is="item.icon" class="size-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <UiKbd class="opacity-0 transition-opacity group-hover:opacity-100">
                  {{ navIndex(item) }}
                </UiKbd>
              </NuxtLink>
            </template>
          </div>
        </div>

        <div>
          <button
            v-if="!sidebar.collapsed.value"
            type="button"
            class="text-muted-foreground hover:text-foreground mb-1 flex w-full items-center justify-between rounded-md px-2 py-1 text-[11px] font-medium tracking-wide uppercase"
            @click="toolsOpen = !toolsOpen"
          >
            Tools
            <ChevronDown
              class="size-3.5 transition-transform"
              :class="toolsOpen ? '' : '-rotate-90'"
            />
          </button>
          <div
            v-show="sidebar.collapsed.value || toolsOpen"
            :class="cn('flex flex-col gap-0.5', sidebar.collapsed.value && 'items-center')"
          >
            <template v-for="item in TOOLS" :key="item.to">
              <UiTooltip
                v-if="sidebar.collapsed.value"
                side="right"
                :content="`${item.label} · ${navIndex(item)}`"
              >
                <NuxtLink
                  :to="navTo(item.to)"
                  :aria-label="item.label"
                  :class="cn(
                    'text-muted-foreground hover:text-foreground hover:bg-accent/50 flex size-9 items-center justify-center rounded-md transition-colors',
                    isActive(item.to) && 'bg-accent text-accent-foreground',
                  )"
                >
                  <component :is="item.icon" class="size-4" />
                </NuxtLink>
              </UiTooltip>
              <NuxtLink
                v-else
                :to="navTo(item.to)"
                :class="cn(
                  'text-muted-foreground hover:text-foreground hover:bg-accent/50 group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive(item.to) && 'bg-accent text-accent-foreground',
                )"
              >
                <component :is="item.icon" class="size-4 shrink-0" />
                <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
                <UiKbd class="opacity-0 transition-opacity group-hover:opacity-100">
                  {{ navIndex(item) }}
                </UiKbd>
              </NuxtLink>
            </template>
          </div>
        </div>
      </nav>

      <div
        :class="cn(
          'flex h-14 shrink-0 items-center border-t',
          sidebar.collapsed.value ? 'justify-center px-2' : 'px-3',
        )"
      >
        <UiTooltip
          side="right"
          :content="connected ? 'Live — updates stream as your agent works' : 'Reconnecting…'"
        >
          <span
            :class="cn(
              'text-muted-foreground flex items-center gap-2 text-xs',
              sidebar.collapsed.value && 'justify-center',
            )"
          >
            <span
              class="size-1.5 shrink-0 rounded-full"
              :class="connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'"
            />
            <span v-if="!sidebar.collapsed.value">{{ connected ? 'live' : 'offline' }}</span>
          </span>
        </UiTooltip>
      </div>

      <!-- Level with Browse; centred on the divider (half in / half out). Sidebar hover. -->
      <div class="pointer-events-none absolute top-20 right-0 z-50 hidden translate-x-1/2 -translate-y-1/2 md:block">
        <UiTooltip side="right" :content="collapseLabel">
          <button
            type="button"
            :aria-label="collapseLabel"
            :class="cn(
              'bg-background text-muted-foreground hover:text-foreground flex size-6 items-center justify-center rounded-full border shadow-sm transition-opacity',
              sidebarHover ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0',
            )"
            tabindex="-1"
            @click="sidebar.toggle()"
            @focus="sidebarHover = true"
            @blur="sidebarHover = false"
          >
            <PanelLeftOpen v-if="sidebar.collapsed.value" class="size-3.5" />
            <PanelLeftClose v-else class="size-3.5" />
          </button>
        </UiTooltip>
      </div>
    </aside>

    <!-- Mobile drawer -->
    <Teleport to="body">
      <div
        v-if="mobileOpen"
        class="fixed inset-0 z-50 md:hidden"
      >
        <button
          type="button"
          class="bg-background/80 absolute inset-0 backdrop-blur-sm"
          aria-label="Close menu"
          @click="mobileOpen = false"
        />
        <aside class="bg-background absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r shadow-lg">
          <div class="flex h-14 max-h-14 min-h-14 items-center justify-between gap-2 overflow-hidden border-b px-3">
            <NuxtLink
              to="/"
              class="flex items-center"
              aria-label="nomnomtokens home"
              @click="mobileOpen = false"
            >
              <Logo :size="20" />
            </NuxtLink>
            <UiButton
              variant="ghost"
              size="icon-sm"
              aria-label="Close menu"
              @click="mobileOpen = false"
            >
              <X class="size-4" />
            </UiButton>
          </div>
          <nav class="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3">
            <div>
              <p class="text-muted-foreground mb-1 px-2 text-[11px] font-medium tracking-wide uppercase">
                Browse
              </p>
              <div class="flex flex-col gap-0.5">
                <NuxtLink
                  v-for="item in BROWSE"
                  :key="item.to"
                  :to="navTo(item.to)"
                  :class="cn(
                    'text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    isActive(item.to) && 'bg-accent text-accent-foreground',
                  )"
                >
                  <component :is="item.icon" class="size-4" />
                  {{ item.label }}
                </NuxtLink>
              </div>
            </div>
            <div>
              <p class="text-muted-foreground mb-1 px-2 text-[11px] font-medium tracking-wide uppercase">
                Tools
              </p>
              <div class="flex flex-col gap-0.5">
                <NuxtLink
                  v-for="item in TOOLS"
                  :key="item.to"
                  :to="navTo(item.to)"
                  :class="cn(
                    'text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    isActive(item.to) && 'bg-accent text-accent-foreground',
                  )"
                >
                  <component :is="item.icon" class="size-4" />
                  {{ item.label }}
                </NuxtLink>
              </div>
            </div>
          </nav>
        </aside>
      </div>
    </Teleport>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- border-b on the h-14 row itself (not a wrapper) so it matches the sidebar brand seam -->
      <header class="bg-background/80 sticky top-0 z-30 backdrop-blur">
        <div class="flex h-14 max-h-14 min-h-14 items-center gap-2 overflow-hidden border-b px-4 sm:px-6">
          <UiButton
            variant="ghost"
            size="icon-sm"
            class="md:hidden"
            aria-label="Open menu"
            @click="mobileOpen = true"
          >
            <Menu class="size-4" />
          </UiButton>

          <NuxtLink
            to="/"
            class="flex items-center md:hidden"
            aria-label="nomnomtokens home"
          >
            <Logo :size="20" :show-wordmark="false" />
          </NuxtLink>

          <div class="ml-auto flex items-center gap-2">
            <span class="flex items-center md:hidden" :title="connected ? 'Live' : 'Reconnecting…'">
              <span
                class="size-1.5 rounded-full"
                :class="connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'"
              />
            </span>

            <UiButton variant="outline" size="sm" class="gap-2 font-normal" @click="paletteOpen = true">
              <span class="text-muted-foreground">Search…</span>
              <UiKbd>⌘K</UiKbd>
            </UiButton>

            <UiTooltip side="left" :content="`${THEME_LABEL[theme.preference.value]} — click to change`">
              <UiButton
                variant="ghost"
                size="icon-sm"
                :aria-label="THEME_LABEL[theme.preference.value]"
                @click="theme.cycle()"
              >
                <ClientOnly>
                  <component :is="THEME_ICON[theme.preference.value]" class="size-4" />
                  <template #fallback>
                    <Sun class="size-4" />
                  </template>
                </ClientOnly>
              </UiButton>
            </UiTooltip>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <slot />
      </main>

      <footer class="text-muted-foreground mx-auto w-full max-w-7xl px-4 pb-8 text-xs sm:px-6">
        <UiSeparator class="mb-4" />
        <p>
          Everything on this page was computed on this machine from
          <code class="font-mono">{{ meta?.dbPath ?? '~/.nomnomtokens/data.db' }}</code>.
          Nothing was sent anywhere.
        </p>
      </footer>
    </div>

    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />
  </div>
</template>
