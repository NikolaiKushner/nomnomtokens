/** Terminal formatting helpers. No dependency — colours are eight escape codes. */

const ESC = ''
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined

const wrap = (code: string) => (s: string) =>
  useColor ? `${ESC}[${code}m${s}${ESC}[0m` : s

export const c = {
  bold: wrap('1'),
  dim: wrap('2'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  blue: wrap('34'),
  magenta: wrap('35'),
  cyan: wrap('36'),
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n === 0) return '$0.00'
  if (n < 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(2)}`
}

export function compactNumber(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return String(Math.round(n))
}

export function duration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function pct(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : `${n.toFixed(1)}%`
}

/**
 * "47m", "1h47m", "4d3h" — time left on a rate-limit window.
 *
 * Deliberately tighter than the dashboard's `formatWhen` ("in about 2 hours"):
 * the status bar shares one line with the prompt, so every character spent here
 * is one the user does not get for their own text. Two units are enough to
 * decide whether to keep going or take a break.
 *
 * Takes unix ms. Returns null when there is nothing worth printing, so callers
 * can drop the segment rather than render a dash.
 */
export function untilReset(ms: number | null | undefined, now = Date.now()): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null

  const delta = ms - now
  // A window whose reset has passed is about to be replaced by the next
  // payload; "now" is truer for that beat than a negative countdown.
  if (delta <= 0) return 'now'

  // Round the leading unit down: telling someone they have 2h when they have
  // 1h59m is the error that costs them a turn mid-task.
  const minutes = Math.floor(delta / 60_000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${hours}h` : `${hours}h${rest}m`
  }

  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return rest === 0 ? `${days}d` : `${days}d${rest}h`
}

export const MASCOT = String.raw`
    (\_/)
   ( o.o )   nom nom nom
    > ^ <
`
