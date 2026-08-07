<script setup lang="ts">
import { Activity, BarChart3, Boxes, Clock, FolderTree, Gauge, Monitor, Moon, Sun } from 'lucide-vue-next'
import { cn } from '~/lib/utils'

const route = useRoute()
const { connected } = useLive()
const { data: meta } = useMeta()
const theme = useTheme()

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }
const THEME_LABEL = {
  system: 'Theme: following your system',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

const paletteOpen = ref(false)

const NAV = [
  { to: '/', label: 'Overview', icon: Gauge },
  { to: '/timeline', label: 'Timeline', icon: BarChart3 },
  { to: '/scopes', label: 'Projects', icon: FolderTree },
  { to: '/providers', label: 'Providers', icon: Boxes },
  { to: '/sessions', label: 'Sessions', icon: Clock },
  { to: '/limits', label: 'Limits', icon: Activity },
]

const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    paletteOpen.value = true
    return
  }
  // Single-key navigation, the way a terminal tool would do it. Skipped while
  // typing so it never fights a text field.
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
  <div class="bg-background min-h-screen">
    <header class="bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div class="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <NuxtLink to="/" class="flex shrink-0 items-center gap-2">
          <Mascot :size="26" mood="content" />
          <span class="font-semibold tracking-tight">nomnomtokens</span>
        </NuxtLink>

        <nav class="hidden items-center gap-0.5 md:flex">
          <NuxtLink
            v-for="(item, i) in NAV"
            :key="item.to"
            :to="item.to"
            :class="cn(
              'text-muted-foreground hover:text-foreground hover:bg-accent/50 group flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
              isActive(item.to) && 'bg-accent text-accent-foreground',
            )"
          >
            <component :is="item.icon" class="size-4" />
            {{ item.label }}
            <UiKbd class="ml-0.5 opacity-0 transition-opacity group-hover:opacity-100">{{ i + 1 }}</UiKbd>
          </NuxtLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <!-- side="bottom": the header is the topmost element on the page, so a
               tooltip opening upwards escapes the viewport and clips. -->
          <UiTooltip
            side="bottom"
            :content="connected ? 'Live — updates stream as your agent works' : 'Reconnecting…'"
          >
            <span class="flex items-center gap-1.5 text-xs">
              <span
                class="size-1.5 rounded-full"
                :class="connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'"
              />
              <span class="text-muted-foreground hidden sm:inline">{{ connected ? 'live' : 'offline' }}</span>
            </span>
          </UiTooltip>

          <UiButton variant="outline" size="sm" class="gap-2 font-normal" @click="paletteOpen = true">
            <span class="text-muted-foreground">Search…</span>
            <UiKbd>⌘K</UiKbd>
          </UiButton>

          <UiTooltip side="bottom" :content="`${THEME_LABEL[theme.preference.value]} — click to change`">
            <UiButton
              variant="ghost"
              size="icon-sm"
              :aria-label="THEME_LABEL[theme.preference.value]"
              @click="theme.cycle()"
            >
              <!-- ClientOnly: the preference is unknown during SSR, and
                   rendering the wrong icon would be a hydration mismatch. -->
              <ClientOnly>
                <component :is="THEME_ICON[theme.preference.value]" class="size-4" />
                <template #fallback>
                  <Monitor class="size-4" />
                </template>
              </ClientOnly>
            </UiButton>
          </UiTooltip>
        </div>
      </div>

      <!-- mobile nav -->
      <nav class="flex gap-0.5 overflow-x-auto border-t px-2 py-1.5 md:hidden">
        <NuxtLink
          v-for="item in NAV"
          :key="item.to"
          :to="item.to"
          :class="cn(
            'text-muted-foreground rounded-md px-2.5 py-1 text-xs whitespace-nowrap',
            isActive(item.to) && 'bg-accent text-accent-foreground',
          )"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <slot />
    </main>

    <footer class="text-muted-foreground mx-auto max-w-7xl px-4 pb-8 text-xs sm:px-6">
      <UiSeparator class="mb-4" />
      <p>
        Everything on this page was computed on this machine from
        <code class="font-mono">{{ meta?.dbPath ?? '~/.nomnomtokens/data.db' }}</code>.
        Nothing was sent anywhere.
      </p>
    </footer>

    <CommandPalette :open="paletteOpen" @close="paletteOpen = false" />
  </div>
</template>
