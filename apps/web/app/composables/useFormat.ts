/**
 * Formatting.
 *
 * Money and token counts appear on every screen; they must be formatted the
 * same way everywhere or the eye stops trusting them.
 */

const usdFormatter = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

const preciseUsd = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 4,
})

export function formatUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  // sub-cent amounts are common per-event; rounding them to $0.00 makes a
  // populated table look empty
  return n !== 0 && Math.abs(n) < 0.01 ? preciseUsd.format(n) : usdFormatter.format(n)
}

export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return n.toLocaleString()
}

export function formatPct(n: number | null | undefined, digits = 0): string {
  return n === null || n === undefined ? '—' : `${n.toFixed(digits)}%`
}

export function formatRatio(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  const pct = n * 100
  // Cache hit rates genuinely reach 99.9x%; rounding those to a flat "100%"
  // reads as a bug rather than as the (real) result.
  if (pct > 99 && pct < 100) return `${pct.toFixed(2)}%`
  return `${pct.toFixed(1)}%`
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** "in 3h", "Thursday", "past due" — for limit forecasts. */
export function formatWhen(ts: number | null, now = Date.now()): string {
  if (ts === null) return 'not at this rate'
  const delta = ts - now
  if (delta <= 0) return 'now'
  const hours = delta / 3_600_000
  if (hours < 1) return `in ${Math.round(delta / 60_000)} min`
  if (hours < 24) return `in ${Math.round(hours)}h`
  const days = hours / 24
  if (days < 7) {
    return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' })
  }
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Stable chart colour for a series name, so a model keeps its colour across screens. */
export function seriesColor(name: string, index: number): string {
  return `var(--chart-${(index % 8) + 1})`
}
