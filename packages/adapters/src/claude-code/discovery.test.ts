import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ClaudeCodeAdapter } from './index.js'
import type { IngestRecord, ScanCursor, ScanState } from '@nomnomtokens/core'

function memoryState(): ScanState {
  const map = new Map<string, ScanCursor>()
  return {
    get: p => map.get(p),
    set: c => void map.set(c.sourcePath, c),
  }
}

function turn(requestId: string, tokens: number, over: Record<string, unknown> = {}): string {
  return `${JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-01T10:00:00.000Z',
    sessionId: 'sess',
    cwd: '/proj',
    requestId,
    message: {
      id: `msg-${requestId}`,
      model: 'claude-opus-5',
      usage: { input_tokens: tokens, output_tokens: 0 },
    },
    ...over,
  })}\n`
}

async function collect(adapter: ClaudeCodeAdapter, state: ScanState): Promise<IngestRecord[]> {
  const out: IngestRecord[] = []
  for await (const rec of adapter.scan(state)) out.push(rec)
  return out
}

describe('transcript discovery', () => {
  it('finds subagent transcripts nested under <session>/subagents/', async () => {
    // Regression guard. Top-level sessions live at projects/<project>/<id>.jsonl,
    // but Task-tool subagents are three levels deeper. A non-recursive walk
    // silently omitted 836 records on the corpus this was built against.
    const root = mkdtempSync(join(tmpdir(), 'nnt-'))
    const project = join(root, '-Users-me-dev-app')
    const subagents = join(project, 'session-1', 'subagents')
    mkdirSync(subagents, { recursive: true })

    writeFileSync(join(project, 'session-1.jsonl'), turn('req-top', 10))
    writeFileSync(
      join(subagents, 'agent-abc.jsonl'),
      turn('req-sub', 7, { isSidechain: true }),
    )

    const records = await collect(new ClaudeCodeAdapter({ root }), memoryState())
    const events = records.flatMap(r => (r.type === 'event' ? [r.event] : []))

    expect(events).toHaveLength(2)
    expect(events.map(e => e.qty.in ?? 0).sort((a, b) => a - b)).toEqual([7, 10])
    expect(events.find(e => e.meta.sidechain === 1)).toBeDefined()
  })

  it('resumes from the stored offset instead of re-reading the file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nnt-'))
    const project = join(root, '-proj')
    mkdirSync(project, { recursive: true })
    const file = join(project, 'a.jsonl')
    writeFileSync(file, turn('req-1', 1))

    const state = memoryState()
    const adapter = new ClaudeCodeAdapter({ root })

    const first = await collect(adapter, state)
    expect(first.filter(r => r.type === 'event')).toHaveLength(1)

    // unchanged file: nothing to do at all
    expect(await collect(adapter, state)).toHaveLength(0)

    // appended: only the new record comes back
    writeFileSync(file, turn('req-1', 1) + turn('req-2', 2))
    const third = await collect(adapter, state)
    const events = third.flatMap(r => (r.type === 'event' ? [r.event] : []))
    expect(events).toHaveLength(1)
    expect(events[0]!.qty.in).toBe(2)
  })

  it('re-reads from the top when a file shrinks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nnt-'))
    const project = join(root, '-proj')
    mkdirSync(project, { recursive: true })
    const file = join(project, 'a.jsonl')

    writeFileSync(file, turn('req-1', 1) + turn('req-2', 2))
    const state = memoryState()
    const adapter = new ClaudeCodeAdapter({ root })
    await collect(adapter, state)

    writeFileSync(file, turn('req-3', 3)) // rotated
    const events = (await collect(adapter, state)).flatMap(r => (r.type === 'event' ? [r.event] : []))
    expect(events).toHaveLength(1)
    expect(events[0]!.qty.in).toBe(3)
  })

  it('does not lose a record whose multi-byte characters straddle a read chunk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nnt-'))
    const project = join(root, '-proj')
    mkdirSync(project, { recursive: true })

    // Pad with enough non-ASCII to push a character across the 64KB stream
    // boundary; decoding chunks independently mangles it into U+FFFD and the
    // line's JSON stops parsing.
    const padding = '日本語テキスト'.repeat(20_000)
    writeFileSync(
      join(project, 'a.jsonl'),
      turn('req-1', 1, { note: padding }) + turn('req-2', 2),
    )

    const events = (await collect(new ClaudeCodeAdapter({ root }), memoryState()))
      .flatMap(r => (r.type === 'event' ? [r.event] : []))
    expect(events).toHaveLength(2)
  })
})
