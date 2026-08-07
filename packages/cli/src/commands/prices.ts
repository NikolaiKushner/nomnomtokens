import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PRICES,
  parsePricesFile,
  resolveModelKey,
  type ModelPrice,
  type PricesFile,
} from '@nomnomtokens/core'
import {
  defaultPricesPath,
  loadPriceTable,
  savePricesFile,
  writeBundledPrices,
} from '@nomnomtokens/db'
import { c } from '../format.js'

export interface PricesOptions {
  from?: string
  quiet?: boolean
}

async function loadFromSource(from: string): Promise<PricesFile> {
  let text: string
  if (/^https?:\/\//i.test(from)) {
    const res = await fetch(from)
    if (!res.ok) throw new Error(`fetch ${from}: HTTP ${res.status}`)
    text = await res.text()
  } else {
    text = readFileSync(resolve(from), 'utf8')
  }
  const file = parsePricesFile(text)
  return {
    ...file,
    updatedAt: new Date().toISOString(),
    source: from,
  }
}

/**
 * `nnt prices show` — print where rates come from and a few resolved samples.
 */
export function pricesShow(): void {
  const { file, path } = loadPriceTable()
  const overrideCount = file ? Object.keys(file.models).length : 0
  console.log(c.bold('Price table'))
  console.log(`  file     ${existsLabel(path, file !== null)}`)
  if (file?.updatedAt) console.log(`  updated  ${file.updatedAt}`)
  if (file?.source) console.log(`  source   ${file.source}`)
  console.log(`  bundled  ${Object.keys(PRICES).length} models`)
  console.log(`  overrides ${overrideCount} model(s) in file`)
  console.log()
  console.log(c.dim('Sample (effective USD / 1M tokens):'))
  for (const id of ['claude-sonnet-4-5', 'claude-opus-4-6', 'gpt-5.6', 'gemini-3-flash']) {
    const key = resolveModelKey(id)
    const p = key ? (file?.models[key] ?? PRICES[key]) : null
    console.log(`  ${id.padEnd(22)} ${formatPrice(p)}`)
  }
  console.log()
  console.log(c.dim('Edit the file, or run `nnt prices refresh` / `nnt prices refresh --from <url|path>`.'))
}

function existsLabel(path: string, ok: boolean): string {
  return ok ? path : `${path} ${c.dim('(missing — using bundled)')}`
}

function formatPrice(p: ModelPrice | null | undefined): string {
  if (!p) return c.dim('unpriced')
  return `in $${p.input}  out $${p.output}`
}

/**
 * `nnt prices refresh` — write bundled rates (or merge `--from`) into prices.json.
 * Scan/import then use that file. Network only when `--from https://…` is set.
 */
export async function pricesRefresh(opts: PricesOptions = {}): Promise<void> {
  const path = defaultPricesPath()
  let file: PricesFile

  if (opts.from) {
    try {
      file = await loadFromSource(opts.from)
    } catch (err) {
      console.error(c.red(err instanceof Error ? err.message : String(err)))
      process.exitCode = 1
      return
    }
    // Layer on bundled so a partial remote list does not wipe unknown models.
    file = {
      ...file,
      models: { ...PRICES, ...file.models },
    }
    savePricesFile(file, path)
  } else {
    file = writeBundledPrices(path)
  }

  if (!opts.quiet) {
    console.log(
      `${c.cyan('prices')}  wrote ${c.bold(String(Object.keys(file.models).length))} models → ${path}`,
    )
    if (file.source) console.log(c.dim(`source ${file.source}`))
  }
}
