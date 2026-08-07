export const SIDEBAR_COLLAPSED_KEY = 'nnt-sidebar-collapsed'

/**
 * Desktop sidebar width preference. Expanded shows labels; collapsed is an
 * icon rail. Mobile uses a drawer and ignores this flag.
 */
const collapsed = ref(false)
const ready = ref(false)

export function useSidebar() {
  onMounted(() => {
    collapsed.value = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
    ready.value = true
  })

  function setCollapsed(next: boolean): void {
    collapsed.value = next
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
  }

  function toggle(): void {
    setCollapsed(!collapsed.value)
  }

  return {
    collapsed: readonly(collapsed),
    ready: readonly(ready),
    setCollapsed,
    toggle,
  }
}
