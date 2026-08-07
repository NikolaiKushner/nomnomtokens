export type ThemePreference = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'nnt-theme'

/**
 * Theme state — light or dark only.
 *
 * Module-level refs make this a singleton. It is only ever written on the
 * client; the pre-paint script in app.vue owns the very first application.
 */
const preference = ref<ThemePreference>('dark')
const ready = ref(false)

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark'
}

/** Map legacy `system` (and anything else) to a concrete preference once. */
function migrateStored(raw: string | null): ThemePreference {
  if (isPreference(raw)) return raw
  if (raw === 'system') {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

function apply(): void {
  const dark = preference.value === 'dark'
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme() {
  onMounted(() => {
    preference.value = migrateStored(localStorage.getItem(THEME_STORAGE_KEY))
    // Rewrite legacy values so the next load is already light|dark.
    localStorage.setItem(THEME_STORAGE_KEY, preference.value)
    apply()
    ready.value = true
  })

  function set(next: ThemePreference): void {
    preference.value = next
    localStorage.setItem(THEME_STORAGE_KEY, next)
    apply()
  }

  /** light ↔ dark */
  function cycle(): void {
    set(preference.value === 'light' ? 'dark' : 'light')
  }

  return {
    preference: readonly(preference),
    resolved: readonly(preference),
    /** false until mounted — guards against a hydration mismatch on the icon */
    ready: readonly(ready),
    set,
    cycle,
  }
}
