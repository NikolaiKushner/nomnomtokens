export type ThemePreference = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'nnt-theme'

/**
 * Theme state.
 *
 * Three preferences, not a boolean: "follow the system" has to be a state you
 * can return to, otherwise the first click on the toggle silently opts you out
 * of your OS setting forever.
 *
 * Module-level refs make this a singleton — the header toggle and anything else
 * reading the theme share one source of truth. It is only ever written on the
 * client; the pre-paint script in app.vue owns the very first application.
 */
const preference = ref<ThemePreference>('system')
const resolved = ref<'light' | 'dark'>('dark')
const ready = ref(false)

let media: MediaQueryList | null = null

function systemPrefersDark(): boolean {
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

function apply(): void {
  const dark = preference.value === 'system'
    ? systemPrefersDark()
    : preference.value === 'dark'

  resolved.value = dark ? 'dark' : 'light'
  document.documentElement.classList.toggle('dark', dark)
  // Tells the browser which scrollbars and form controls to render.
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme() {
  onMounted(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    preference.value = isPreference(stored) ? stored : 'system'
    apply()
    ready.value = true

    // Following the system means following it live — if the OS flips at sunset
    // while the dashboard is open, it should flip too.
    media ??= globalThis.matchMedia?.('(prefers-color-scheme: dark)') ?? null
    media?.addEventListener('change', onSystemChange)
  })

  onBeforeUnmount(() => media?.removeEventListener('change', onSystemChange))

  function onSystemChange() {
    if (preference.value === 'system') apply()
  }

  function set(next: ThemePreference): void {
    preference.value = next
    // Persisted, so the choice survives a restart of the dashboard.
    localStorage.setItem(THEME_STORAGE_KEY, next)
    apply()
  }

  /** system → light → dark → system */
  function cycle(): void {
    set(preference.value === 'system' ? 'light' : preference.value === 'light' ? 'dark' : 'system')
  }

  return {
    preference: readonly(preference),
    resolved: readonly(resolved),
    /** false until mounted — guards against a hydration mismatch on the icon */
    ready: readonly(ready),
    set,
    cycle,
  }
}
