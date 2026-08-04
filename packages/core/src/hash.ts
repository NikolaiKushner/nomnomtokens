/**
 * Scope hashing.
 *
 * A "scope" is whatever the provider considers a project. We never store the
 * path in an event — only sha256(path).slice(0,16). The readable label lives in
 * the local `scopes` table and never leaves the machine (see docs/privacy.md).
 *
 * Uses Web Crypto so this module stays isomorphic; results are memoised because
 * a scan hashes the same handful of project paths millions of times.
 */

const cache = new Map<string, string>()

export async function scopeHash(input: string): Promise<string> {
  const cached = cache.get(input)
  if (cached) return cached

  const bytes = new TextEncoder().encode(input)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)

  cache.set(input, hex)
  return hex
}

/** Last path segment, used as the default human-readable label. Stays local. */
export function scopeLabel(path: string): string {
  const cleaned = path.replace(/[/\\]+$/, '')
  const seg = cleaned.split(/[/\\]/).pop()
  return seg && seg.length > 0 ? seg : cleaned
}
