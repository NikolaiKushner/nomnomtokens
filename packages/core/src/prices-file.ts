import type { ModelPrice, PriceTable } from './pricing.js'
import { PRICES, makePriceTable } from './pricing.js'

/**
 * On-disk price overrides (`~/.nomnomtokens/prices.json`).
 *
 * Bundled `PRICES` is the fallback; this file wins so rates can change without
 * shipping a release. Shape is deliberately boring so a human can edit it.
 */

export interface PricesFile {
  /** ISO timestamp of the last write / refresh */
  updatedAt?: string
  /** optional note (e.g. source URL) */
  source?: string
  models: Record<string, ModelPrice>
}

export function parsePricesFile(text: string): PricesFile {
  const raw = JSON.parse(text) as unknown
  if (!raw || typeof raw !== 'object') throw new Error('prices file must be a JSON object')
  const obj = raw as Record<string, unknown>

  // Accept either `{ models: { … } }` or a bare `{ "claude-sonnet-4-5": { input, output } }`
  const modelsRaw = (obj.models && typeof obj.models === 'object' && !Array.isArray(obj.models))
    ? obj.models as Record<string, unknown>
    : obj

  const models: Record<string, ModelPrice> = {}
  for (const [key, value] of Object.entries(modelsRaw)) {
    if (key === 'updatedAt' || key === 'source' || key === 'models') continue
    if (!value || typeof value !== 'object') continue
    const v = value as Record<string, unknown>
    if (typeof v.input !== 'number' || typeof v.output !== 'number') {
      throw new Error(`model ${key}: need numeric input and output (USD per 1M tokens)`)
    }
    models[key] = {
      input: v.input,
      output: v.output,
      ...(typeof v.cacheWrite5m === 'number' ? { cacheWrite5m: v.cacheWrite5m } : {}),
      ...(typeof v.cacheWrite1h === 'number' ? { cacheWrite1h: v.cacheWrite1h } : {}),
      ...(typeof v.cacheRead === 'number' ? { cacheRead: v.cacheRead } : {}),
    }
  }

  return {
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : undefined,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    models,
  }
}

export function serializePricesFile(file: PricesFile): string {
  return `${JSON.stringify({
    updatedAt: file.updatedAt ?? new Date().toISOString(),
    ...(file.source ? { source: file.source } : {}),
    models: file.models,
  }, null, 2)}\n`
}

/** Bundled table as a PricesFile — the seed for `nnt prices refresh`. */
export function bundledPricesFile(): PricesFile {
  return {
    updatedAt: new Date().toISOString(),
    source: 'bundled',
    models: { ...PRICES },
  }
}

export function priceTableFromFile(file: PricesFile | null | undefined): PriceTable {
  return makePriceTable(file?.models ?? {})
}
