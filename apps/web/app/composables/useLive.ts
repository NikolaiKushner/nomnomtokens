export interface LiveFrame {
  now: number
  lastTs: number | null
  events: number
  today: { costUsd: number, tokens: number, sessions: number, events: number }
  limits: Array<{ provider: string, window: string, usedPct: number | null, resetsAt: number | null }>
}

/**
 * Subscribe to the server's aggregate stream.
 *
 * Deliberately a singleton: six screens all want the live headline, and six
 * EventSource connections to the same endpoint would be six identical
 * aggregations per second.
 */
const frame = ref<LiveFrame | null>(null)
const connected = ref(false)
let source: EventSource | null = null
let refCount = 0
let retry = 1000

export function useLive() {
  onMounted(() => {
    refCount += 1
    if (source) return
    connect()
  })

  onBeforeUnmount(() => {
    refCount -= 1
    if (refCount <= 0) {
      source?.close()
      source = null
      connected.value = false
    }
  })

  function connect() {
    source = new EventSource('/api/events/stream')

    source.addEventListener('open', () => {
      connected.value = true
      retry = 1000 // reset the backoff once a connection sticks
    })

    source.addEventListener('stats', (event) => {
      frame.value = JSON.parse((event as MessageEvent<string>).data) as LiveFrame
    })

    source.addEventListener('error', () => {
      connected.value = false
      source?.close()
      source = null
      if (refCount > 0) {
        // The very first frame after reconnecting is a full snapshot, so a gap
        // in the stream costs freshness but never correctness.
        setTimeout(connect, retry)
        retry = Math.min(retry * 2, 30_000)
      }
    })
  }

  return {
    frame: readonly(frame),
    connected: readonly(connected),
    /** most recent event timestamp the server has seen */
    lastTs: computed(() => frame.value?.lastTs ?? null),
  }
}
