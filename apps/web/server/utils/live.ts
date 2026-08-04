import { bucketStart } from '@nomnomtokens/core'

/**
 * Live update fan-out.
 *
 * Two rules from the spec, both load-bearing:
 *   - the server aggregates and pushes at most once a second, however fast the
 *     agent writes;
 *   - the client remembers the last `ts` it saw and asks for the delta on
 *     reconnect, so a dropped connection doesn't leave a hole in the chart.
 *
 * Writers (the in-process watcher, POST /api/ingest, or an out-of-process
 * `nnt scan --watch`) mark the store dirty; a single interval does the
 * aggregation once and serialises it once for every subscriber.
 */

type Subscriber = (frame: Record<string, unknown>) => void

const subscribers = new Set<Subscriber>()
let dirty = false
let timer: NodeJS.Timeout | null = null
let lastSeenTs = 0

export function notifyIngest(): void {
  dirty = true
}

export function subscribe(fn: Subscriber): () => void {
  subscribers.add(fn)
  ensureTimer()
  return () => {
    subscribers.delete(fn)
    if (subscribers.size === 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

/** The frame every client gets. Small on purpose — it drives counters, not tables. */
export function buildFrame(): Record<string, unknown> {
  const q = queries()
  const now = Date.now()
  const today = q.totals({ from: bucketStart(now, 'day'), kind: 'tokens' })
  const bounds = q.bounds()
  lastSeenTs = bounds.last ?? lastSeenTs

  return {
    now,
    lastTs: bounds.last,
    events: bounds.events,
    today: {
      costUsd: today.costUsd,
      tokens: today.tokens,
      sessions: today.sessions,
      events: today.events,
    },
    limits: q.limitWindows().map((w) => {
      const snaps = q.limitSnapshots(w.provider, w.window, now - 24 * 3_600_000)
      const last = snaps[snaps.length - 1]
      return { ...w, usedPct: last?.usedPct ?? null, resetsAt: last?.resetsAt ?? null }
    }),
  }
}

function ensureTimer(): void {
  if (timer) return
  timer = setInterval(() => {
    if (!dirty || subscribers.size === 0) return
    dirty = false

    // Aggregate once, not once per subscriber.
    const frame = buildFrame()
    for (const fn of subscribers) fn(frame)
  }, 1000)

  // Never hold the process open just to push updates nobody is reading.
  timer.unref?.()
}

/**
 * Poll the store for writes made by another process (`nnt scan --watch`, or the
 * statusline hook writing directly). Cheap: one indexed MAX(ts) per tick.
 */
export function watchForExternalWrites(): void {
  const poll = setInterval(() => {
    if (subscribers.size === 0) return
    const last = queries().bounds().last ?? 0
    if (last > lastSeenTs) {
      lastSeenTs = last
      dirty = true
    }
  }, 1000)
  poll.unref?.()
}
