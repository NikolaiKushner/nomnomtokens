import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  bundledPricesFile,
  parsePricesFile,
  priceTableFromFile,
  serializePricesFile,
  type PriceTable,
  type PricesFile,
} from '@nomnomtokens/core'
import { defaultDataDir } from './client.js'

export function defaultPricesPath(): string {
  return join(defaultDataDir(), 'prices.json')
}

/**
 * Effective price table: disk overrides layered on the bundled fallback.
 * Missing / unreadable file → bundled only (never throws on open).
 */
export function loadPriceTable(path: string = defaultPricesPath()): {
  prices: PriceTable
  file: PricesFile | null
  path: string
} {
  if (!existsSync(path)) {
    return { prices: priceTableFromFile(null), file: null, path }
  }
  try {
    const file = parsePricesFile(readFileSync(path, 'utf8'))
    return { prices: priceTableFromFile(file), file, path }
  } catch {
    return { prices: priceTableFromFile(null), file: null, path }
  }
}

export function savePricesFile(file: PricesFile, path: string = defaultPricesPath()): void {
  mkdirSync(defaultDataDir(), { recursive: true })
  writeFileSync(path, serializePricesFile({
    ...file,
    updatedAt: file.updatedAt ?? new Date().toISOString(),
  }), 'utf8')
}

/** Materialise the bundled table so the user can edit rates without a release. */
export function writeBundledPrices(path: string = defaultPricesPath()): PricesFile {
  const file = bundledPricesFile()
  savePricesFile(file, path)
  return file
}
