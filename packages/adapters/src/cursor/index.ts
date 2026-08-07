import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { Adapter, IngestRecord, PriceTable, ScanState } from '@nomnomtokens/core'
import { scopeHash } from '@nomnomtokens/core'
import { loadWorkspaceMap, readCursorSnapshot } from './db.js'
import { eventsFromComposer } from './parse.js'
import {
  cursorStateDbExists,
  cursorStateDbPath,
  cursorUserDataDir,
  cursorWorkspaceStorageDir,
  labelFromWorkspacePath,
} from './paths.js'

export * from './parse.js'
export * from './paths.js'
export { loadWorkspaceMap, readCursorSnapshot } from './db.js'

export interface CursorAdapterOptions {
  /** Override Cursor user-data root (tests). */
  userDataDir?: string
  /** Override path to state.vscdb (tests). */
  stateDbPath?: string
  prices?: PriceTable
}

/**
 * Adapter for Cursor IDE local spend data.
 *
 * Reads User/globalStorage/state.vscdb (composer bubbles + headers) and maps
 * workspaces via workspaceStorage/<id>/workspace.json. Cursor often stores
 * zero token counts locally — bubbles without numbers are skipped rather than
 * estimated from message text.
 */
export class CursorAdapter implements Adapter {
  readonly name = 'cursor'
  private readonly userDataDir: string
  private readonly stateDbPath: string
  private readonly prices: PriceTable | undefined

  constructor(opts: CursorAdapterOptions = {}) {
    this.userDataDir = opts.userDataDir ?? cursorUserDataDir()
    this.stateDbPath = opts.stateDbPath ?? cursorStateDbPath(this.userDataDir)
    this.prices = opts.prices
  }

  async detect(): Promise<boolean> {
    return existsSync(this.stateDbPath) || cursorStateDbExists(this.userDataDir)
  }

  async *scan(state: ScanState): AsyncIterable<IngestRecord> {
    const info = await stat(this.stateDbPath).catch(() => null)
    if (!info) return

    const cursor = state.get(this.stateDbPath)
    if (cursor && cursor.size === info.size && cursor.mtime === info.mtimeMs) return

    yield* this.emitSnapshot()

    state.set({
      sourcePath: this.stateDbPath,
      mtime: info.mtimeMs,
      size: info.size,
      offset: info.size,
    })
  }

  /**
   * Rescan when the DB or its WAL changes. History is owned by scan();
   * upsert makes a full re-emit of unchanged bubbles a no-op.
   */
  watch(emit: (r: IngestRecord) => void): () => void {
    let closed = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let inFlight = false

    const run = async () => {
      if (closed || inFlight) return
      inFlight = true
      try {
        for await (const record of this.emitSnapshot()) {
          if (closed) return
          emit(record)
        }
      } catch {
        // A mid-write torn read is fine — the next change event retries.
      } finally {
        inFlight = false
      }
    }

    const schedule = () => {
      if (closed) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        void run()
      }, 400)
    }

    const watcherPromise = import('chokidar').then(({ watch }) => {
      const w = watch(
        [this.stateDbPath, `${this.stateDbPath}-wal`, `${this.stateDbPath}-shm`],
        {
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
        },
      )
      w.on('add', schedule)
      w.on('change', schedule)
      return w
    })

    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      void watcherPromise.then(w => w.close())
    }
  }

  private async *emitSnapshot(): AsyncIterable<IngestRecord> {
    const workspaces = loadWorkspaceMap(cursorWorkspaceStorageDir(this.userDataDir))
    const snapshot = readCursorSnapshot(this.stateDbPath, workspaces)
    const seenScopes = new Set<string>()
    const parseOpts = this.prices ? { prices: this.prices } : {}

    for (const [composerId, composer] of snapshot.composers) {
      const bubbles = snapshot.bubbles.get(composerId) ?? []
      if (bubbles.length === 0) continue

      const workspacePath = snapshot.workspaceByComposer.get(composerId)
      const hash = workspacePath ? await scopeHash(workspacePath) : 'unknown'

      if (!seenScopes.has(hash)) {
        seenScopes.add(hash)
        yield {
          type: 'scope',
          scopeHash: hash,
          label: workspacePath ? labelFromWorkspacePath(workspacePath) : 'workspace',
          provider: this.name,
        }
      }

      for (const event of eventsFromComposer(composer, bubbles, hash, parseOpts)) {
        yield { type: 'event', event }
      }
    }
  }
}
