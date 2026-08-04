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

export const MASCOT = String.raw`
    (\_/)
   ( o.o )   nom nom nom
    > ^ <
`
