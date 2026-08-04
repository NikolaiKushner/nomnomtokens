import { createReadStream, existsSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import type { Adapter, IngestRecord, PriceTable, ScanState } from '@nomnomtokens/core'
import { ClaudeCodeJsonlParser } from './jsonl.js'

export * from './jsonl.js'
export * from './statusline.js'

export function claudeProjectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects')
}

/**
 * Claude Code encodes the project path into the directory name by replacing
 * separators with dashes (`/Users/me/dev/app` -> `-Users-me-dev-app`). The
 * mapping is lossy — a real dash is indistinguishable from a separator — so we
 * only ever use this for a fallback label, never to reconstruct a path.
 */
export function labelFromProjectDir(dirName: string): string {
  const parts = dirName.split('-').filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1]! : dirName
}

/**
 * Read newline-delimited records from `start`, yielding whole lines only.
 *
 * Returns the byte offset of the last complete line so a live file that is
 * mid-write is resumed exactly where it was left, rather than losing or
 * duplicating the torn record.
 */
async function* readLinesFrom(
  path: string,
  start: number,
): AsyncGenerator<{ line: string, offset: number }> {
  const stream = createReadStream(path, { start })
  // A StringDecoder, not chunk.toString(): transcripts are full of non-ASCII,
  // and a multi-byte character straddling a chunk boundary decodes to U+FFFD,
  // corrupting that line's JSON and silently dropping the record.
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

/**
 * Walk every transcript under the projects root, at any depth.
 *
 * Depth matters more than it looks. Top-level sessions sit at
 * `projects/<project>/<session>.jsonl`, but **subagent transcripts are nested
 * three levels further down**, at
 * `projects/<project>/<session>/subagents/agent-*.jsonl`. Anything that globs
 * `projects/*​/*.jsonl` silently omits every Task-tool subagent — which is real,
 * often expensive spend. On the corpus this parser was built against that was
 * 836 records across 13 files, invisible.
 */
async function* walkJsonl(
  root: string,
  projectDir?: string,
): AsyncGenerator<{ path: string, projectDir: string }> {
  let entries: Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      // the first level under the root is the project; deeper levels inherit it
      yield* walkJsonl(path, projectDir ?? entry.name)
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      yield { path, projectDir: projectDir ?? entry.name }
    }
  }
}

export interface ClaudeCodeAdapterOptions {
  root?: string
  prices?: PriceTable
}

export class ClaudeCodeAdapter implements Adapter {
  readonly name = 'claude-code'
  private readonly root: string
  private readonly prices: PriceTable | undefined

  constructor(opts: ClaudeCodeAdapterOptions = {}) {
    this.root = opts.root ?? claudeProjectsDir()
    this.prices = opts.prices
  }

  async detect(): Promise<boolean> {
    return existsSync(this.root)
  }

  async *scan(state: ScanState): AsyncIterable<IngestRecord> {
    const seenScopes = new Set<string>()

    for await (const { path, projectDir } of walkJsonl(this.root)) {
      const info = await stat(path).catch(() => null)
      if (!info) continue

      const cursor = state.get(path)
      // Same size and mtime as last time: nothing appended, skip the read
      // entirely. This is what makes a re-scan sub-second on a year of logs.
      if (cursor && cursor.size === info.size && cursor.mtime === info.mtimeMs) continue

      // A file that shrank was rotated or rewritten — the old offset is
      // meaningless, so re-read it from the top and let upsert absorb the
      // repeats.
      const start = cursor && info.size >= cursor.size ? cursor.offset : 0

      const parser = new ClaudeCodeJsonlParser(this.prices ? { prices: this.prices } : {})
      let offset = start

      for await (const { line, offset: next } of readLinesFrom(path, start)) {
        offset = next
        const event = await parser.parseLine(line)
        if (!event) continue

        if (!seenScopes.has(event.scopeHash)) {
          seenScopes.add(event.scopeHash)
          yield {
            type: 'scope',
            scopeHash: event.scopeHash,
            label: labelFromProjectDir(projectDir),
            provider: this.name,
          }
        }
        yield { type: 'event', event }
      }

      state.set({ sourcePath: path, mtime: info.mtimeMs, size: info.size, offset })
    }
  }

  /**
   * Tail the transcript directory. Chokidar rather than fs.watch: we need
   * recursive watching that behaves the same on macOS, Linux and Windows.
   */
  watch(emit: (r: IngestRecord) => void): () => void {
    const offsets = new Map<string, number>()
    const inFlight = new Set<string>()
    const parser = new ClaudeCodeJsonlParser(this.prices ? { prices: this.prices } : {})
    let closed = false

    const pump = async (path: string) => {
      // chokidar can fire several times for one append; without this guard two
      // concurrent reads share a stale offset and emit the same lines twice.
      if (closed || inFlight.has(path)) return
      inFlight.add(path)
      try {
        const info = await stat(path).catch(() => null)
        if (!info) return

        const known = offsets.get(path)
        // Unseen file: start at its current end. `scan()` owns history; the
        // watcher only owns what happens from now on.
        let offset = known === undefined ? info.size : info.size < known ? 0 : known

        for await (const { line, offset: next } of readLinesFrom(path, offset)) {
          offset = next
          const event = await parser.parseLine(line)
          if (event) emit({ type: 'event', event })
        }
        offsets.set(path, offset)
      } finally {
        inFlight.delete(path)
      }
    }

    // chokidar is imported lazily so that `packages/core` consumers and the
    // browser build never pull a filesystem watcher into the graph
    const watcherPromise = import('chokidar').then(({ watch }) => {
      const w = watch(this.root, {
        // project / session / subagents / agent-*.jsonl
        depth: 4,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
      })
      w.on('add', p => void (p.endsWith('.jsonl') && pump(p)))
      w.on('change', p => void (p.endsWith('.jsonl') && pump(p)))
      return w
    })

    return () => {
      closed = true
      void watcherPromise.then(w => w.close())
    }
  }
}
