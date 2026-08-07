import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import type { CursorBubble, CursorComposerInfo } from './parse.js'
import { pathFromFolderUri } from './paths.js'

export interface CursorWorkspaceMap {
  /** workspaceStorage folder id → filesystem / remote URI path */
  byId: Map<string, string>
}

export interface CursorSnapshot {
  composers: Map<string, CursorComposerInfo>
  /** composerId → bubbles */
  bubbles: Map<string, CursorBubble[]>
  /** composerId → workspace path for hashing */
  workspaceByComposer: Map<string, string | null>
}

interface ComposerHeader {
  composerId?: string
  totalLinesAdded?: number
  totalLinesRemoved?: number
  workspaceIdentifier?: {
    id?: string
    uri?: { external?: string, path?: string } | string
  }
}

interface ComposerDataRow {
  composerId?: string
  modelConfig?: { modelName?: string, model?: string } | string
  totalLinesAdded?: number
  totalLinesRemoved?: number
}

function decodeValue(value: unknown): unknown {
  if (value == null) return null
  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString('utf8'))
    } catch {
      return null
    }
  }
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function modelFromConfig(mc: ComposerDataRow['modelConfig']): string | null {
  if (!mc) return null
  if (typeof mc === 'string') {
    const t = mc.trim()
    return t && t !== 'default' ? t : null
  }
  const name = (mc.modelName ?? mc.model ?? '').trim()
  return name && name !== 'default' ? name : null
}

function workspacePathFromHeader(
  header: ComposerHeader,
  workspaces: CursorWorkspaceMap,
): string | null {
  const wi = header.workspaceIdentifier
  if (!wi) return null

  if (wi.id) {
    const mapped = workspaces.byId.get(wi.id)
    if (mapped) return mapped
  }

  const uri = wi.uri
  if (typeof uri === 'string') return pathFromFolderUri(uri)
  if (uri && typeof uri === 'object') {
    if (typeof uri.external === 'string') return pathFromFolderUri(uri.external)
    if (typeof uri.path === 'string') return uri.path
  }
  return null
}

/** Load workspaceStorage/<id>/workspace.json → id → folder path. */
export function loadWorkspaceMap(workspaceStorageDir: string): CursorWorkspaceMap {
  const byId = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(workspaceStorageDir)
  } catch {
    return { byId }
  }

  for (const id of entries) {
    try {
      const raw = readFileSync(join(workspaceStorageDir, id, 'workspace.json'), 'utf8')
      const meta = JSON.parse(raw) as { folder?: string }
      const path = pathFromFolderUri(meta.folder)
      if (path) byId.set(id, path)
    } catch {
      // missing or malformed — skip
    }
  }
  return { byId }
}

/**
 * Read-only snapshot of the spend-relevant bits of Cursor's state.vscdb.
 *
 * Opens with `mode=ro` so a live Cursor process holding a write lock does not
 * block us, and we never risk writing to the IDE's database.
 */
export function readCursorSnapshot(
  stateDbPath: string,
  workspaces: CursorWorkspaceMap,
): CursorSnapshot {
  const db = new Database(stateDbPath, { readonly: true, fileMustExist: true })
  try {
    // Prefer WAL-friendly read; ignore if the pragma fails on a plain copy.
    try {
      db.pragma('query_only = ON')
    } catch {
      // ignore
    }

    const composers = new Map<string, CursorComposerInfo>()
    const workspaceByComposer = new Map<string, string | null>()
    const linesByComposer = new Map<string, { added: number, removed: number }>()

    // Headers: workspace + line totals
    const headerRow = db
      .prepare(`SELECT value FROM ItemTable WHERE key = ?`)
      .get('composer.composerHeaders') as { value: unknown } | undefined

    if (headerRow) {
      const parsed = decodeValue(headerRow.value) as { allComposers?: ComposerHeader[] } | null
      for (const h of parsed?.allComposers ?? []) {
        if (!h.composerId) continue
        linesByComposer.set(h.composerId, {
          added: typeof h.totalLinesAdded === 'number' ? h.totalLinesAdded : 0,
          removed: typeof h.totalLinesRemoved === 'number' ? h.totalLinesRemoved : 0,
        })
        workspaceByComposer.set(h.composerId, workspacePathFromHeader(h, workspaces))
      }
    }

    // composerData: model + possibly fresher line totals
    const dataRows = db
      .prepare(`SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'`)
      .all() as Array<{ key: string, value: unknown }>

    for (const row of dataRows) {
      const raw = decodeValue(row.value) as ComposerDataRow | null
      if (!raw) continue
      const composerId = raw.composerId ?? row.key.slice('composerData:'.length)
      if (!composerId) continue

      const lines = linesByComposer.get(composerId) ?? { added: 0, removed: 0 }
      const added = typeof raw.totalLinesAdded === 'number' ? raw.totalLinesAdded : lines.added
      const removed = typeof raw.totalLinesRemoved === 'number' ? raw.totalLinesRemoved : lines.removed

      composers.set(composerId, {
        composerId,
        model: modelFromConfig(raw.modelConfig),
        linesAdded: added,
        linesRemoved: removed,
      })

      if (!workspaceByComposer.has(composerId)) {
        workspaceByComposer.set(composerId, null)
      }
    }

    // Ensure composers that only appear in headers still exist
    for (const [id, lines] of linesByComposer) {
      if (!composers.has(id)) {
        composers.set(id, {
          composerId: id,
          model: null,
          linesAdded: lines.added,
          linesRemoved: lines.removed,
        })
      }
    }

    const bubbles = new Map<string, CursorBubble[]>()
    const bubbleRows = db
      .prepare(`SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'`)
      .all() as Array<{ key: string, value: unknown }>

    for (const row of bubbleRows) {
      // bubbleId:<composerId>:<bubbleId>
      const parts = row.key.split(':')
      if (parts.length < 3) continue
      const composerId = parts[1]!
      const bubbleId = parts.slice(2).join(':')

      const raw = decodeValue(row.value) as Record<string, unknown> | null
      if (!raw || typeof raw !== 'object') continue

      // Pull only the numeric / id fields — never text, diffs, or tool payloads.
      const tokenCount = raw.tokenCount as CursorBubble['tokenCount'] | undefined
      const ctx = raw.contextWindowStatusAtCreation as
        | CursorBubble['contextWindowStatusAtCreation']
        | undefined

      const bubble: CursorBubble = {
        bubbleId: typeof raw.bubbleId === 'string' ? raw.bubbleId : bubbleId,
        composerId,
        type: typeof raw.type === 'number' ? raw.type : undefined,
        createdAt: (raw.createdAt as string | number | undefined)
          ?? (raw.timestamp as string | number | undefined),
        tokenCount: tokenCount && typeof tokenCount === 'object'
          ? {
              inputTokens: typeof tokenCount.inputTokens === 'number' ? tokenCount.inputTokens : 0,
              outputTokens: typeof tokenCount.outputTokens === 'number' ? tokenCount.outputTokens : 0,
            }
          : undefined,
        contextWindowStatusAtCreation: ctx && typeof ctx === 'object'
          ? {
              tokensUsed: typeof ctx.tokensUsed === 'number' ? ctx.tokensUsed : undefined,
              tokenLimit: typeof ctx.tokenLimit === 'number' ? ctx.tokenLimit : undefined,
            }
          : undefined,
      }

      const list = bubbles.get(composerId) ?? []
      list.push(bubble)
      bubbles.set(composerId, list)
    }

    return { composers, bubbles, workspaceByComposer }
  } finally {
    db.close()
  }
}
