import { createReadStream, existsSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { Adapter, IngestRecord, PriceTable, ScanState } from '@nomnomtokens/core'
import { CodexRolloutParser } from './parse.js'
import { codexHome, codexSessionsDir } from './paths.js'

export * from './parse.js'
export * from './paths.js'

async function* readLinesFrom(
  path: string,
  start: number,
): AsyncGenerator<{ line: string, offset: number }> {
  const stream = createReadStream(path, { start })
  const decoder = new StringDecoder('utf8')
  let buffer = ''
  let consumed = start

  for await (const chunk of stream) {
    buffer += decoder.write(chunk as Buffer)
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      consumed += Buffer.byteLength(line, 'utf8') + 1
      yield { line, offset: consumed }
      nl = buffer.indexOf('\n')
    }
  }
}

async function* walkRollouts(root: string): AsyncGenerator<string> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walkRollouts(path)
    } else if (
      entry.isFile()
      && entry.name.endsWith('.jsonl')
      && entry.name.startsWith('rollout-')
    ) {
      yield path
    }
  }
}

export interface CodexAdapterOptions {
  /** Override `CODEX_HOME` / `~/.codex`. */
  home?: string
  prices?: PriceTable
}

export class CodexAdapter implements Adapter {
  readonly name = 'codex'
  private readonly home: string
  private readonly sessions: string
  private readonly prices: PriceTable | undefined

  constructor(opts: CodexAdapterOptions = {}) {
    this.home = opts.home ?? codexHome()
    this.sessions = codexSessionsDir(this.home)
    this.prices = opts.prices
  }

  async detect(): Promise<boolean> {
    return existsSync(this.sessions) || existsSync(this.home)
  }

  async *scan(state: ScanState): AsyncIterable<IngestRecord> {
    const seenScopes = new Set<string>()

    for await (const path of walkRollouts(this.sessions)) {
      const info = await stat(path).catch(() => null)
      if (!info) continue

      const cursor = state.get(path)
      if (cursor && cursor.size === info.size && cursor.mtime === info.mtimeMs) continue

      const start = cursor && info.size >= cursor.size ? cursor.offset : 0
      const parser = new CodexRolloutParser(this.prices ? { prices: this.prices } : {})
      let offset = start

      for await (const { line, offset: next } of readLinesFrom(path, start)) {
        offset = next
        for (const record of await parser.parseLine(line)) {
          if (record.type === 'event' && !seenScopes.has(record.event.scopeHash)) {
            seenScopes.add(record.event.scopeHash)
            yield {
              type: 'scope',
              scopeHash: record.event.scopeHash,
              label: parser.scopeLabel(),
              provider: this.name,
            }
          }
          yield record
        }
      }

      state.set({ sourcePath: path, mtime: info.mtimeMs, size: info.size, offset })
    }
  }

  watch(emit: (r: IngestRecord) => void): () => void {
    const offsets = new Map<string, number>()
    const inFlight = new Set<string>()
    const parsers = new Map<string, CodexRolloutParser>()
    let closed = false

    const pump = async (path: string) => {
      if (closed || inFlight.has(path) || !path.endsWith('.jsonl')) return
      inFlight.add(path)
      try {
        const info = await stat(path).catch(() => null)
        if (!info) return

        const known = offsets.get(path)
        // Unseen file: start at end — `scan()` owns history.
        let offset = known === undefined ? info.size : info.size < known ? 0 : known
        let parser = parsers.get(path)
        if (!parser || offset === 0) {
          parser = new CodexRolloutParser(this.prices ? { prices: this.prices } : {})
          parsers.set(path, parser)
        }

        for await (const { line, offset: next } of readLinesFrom(path, offset)) {
          offset = next
          for (const record of await parser.parseLine(line)) emit(record)
        }
        offsets.set(path, offset)
      } finally {
        inFlight.delete(path)
      }
    }

    const watcherPromise = import('chokidar').then(({ watch }) => {
      const w = watch(this.sessions, {
        // sessions / YYYY / MM / DD / rollout-*.jsonl
        depth: 4,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      })
      w.on('add', p => void pump(p))
      w.on('change', p => void pump(p))
      return w
    })

    return () => {
      closed = true
      void watcherPromise.then(w => w.close())
    }
  }
}
