import { describe, expect, it } from 'vitest'
import { ClaudeCodeJsonlParser, countPatchLines } from './jsonl.js'

/** A record shaped like the ones Claude Code actually writes. */
function assistantLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    timestamp: '2026-07-01T10:21:18.729Z',
    sessionId: 'sess-1',
    cwd: '/Users/me/dev/app',
    requestId: 'req_1',
    message: {
      id: 'msg_1',
      model: 'claude-sonnet-5',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 1000,
        cache_creation_input_tokens: 200,
        cache_creation: {
          ephemeral_5m_input_tokens: 150,
          ephemeral_1h_input_tokens: 50,
        },
      },
    },
    ...over,
  })
}

describe('ClaudeCodeJsonlParser', () => {
  it('extracts token quantities with the cache TTL split', async () => {
    const event = await new ClaudeCodeJsonlParser().parseLine(assistantLine())
    expect(event).not.toBeNull()
    expect(event!.qty).toEqual({
      in: 100,
      out: 50,
      cacheCreate: 150,
      cacheCreate1h: 50,
      cacheRead: 1000,
    })
    expect(event!.kind).toBe('tokens')
    expect(event!.unitLabel).toBe('claude-sonnet-5')
  })

  it('falls back to the flat cache total when the TTL breakdown is absent', async () => {
    const line = assistantLine({
      message: {
        id: 'msg_2',
        model: 'claude-opus-5',
        usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 300 },
      },
    })
    const event = await new ClaudeCodeJsonlParser().parseLine(line)
    expect(event!.qty.cacheCreate).toBe(300)
    expect(event!.qty.cacheCreate1h).toBe(0)
  })

  it('keys dedup on requestId + message.id, never uuid', async () => {
    // Claude Code writes the same turn 2-3x per file, identical apart from uuid.
    // Summing without this collapsing produced a ~2.3x over-report on real data.
    const parser = new ClaudeCodeJsonlParser()
    const a = await parser.parseLine(assistantLine({ uuid: 'aaa' }))
    const b = await parser.parseLine(assistantLine({ uuid: 'bbb' }))
    expect(a!.id).toBe(b!.id)
    expect(a!.id).toBe('claude-code:req_1:msg_1')
  })

  it('prices from the model because modern logs carry no costUSD', async () => {
    const event = await new ClaudeCodeJsonlParser().parseLine(assistantLine())
    // sonnet-5: $3/1M in, $15/1M out, 1.25x 5m write, 2x 1h write, 0.1x read
    const expected
      = (100 * 3 + 150 * 3 * 1.25 + 50 * 3 * 2 + 1000 * 3 * 0.1) / 1e6
      + (50 * 15) / 1e6
    expect(event!.costUsd).toBeCloseTo(expected, 12)
  })

  it('prefers an explicit costUSD when an older log has one', async () => {
    const event = await new ClaudeCodeJsonlParser().parseLine(assistantLine({ costUSD: 0.42 }))
    expect(event!.costUsd).toBe(0.42)
  })

  it('prices synthetic turns at zero — no API call happened', async () => {
    const line = assistantLine({
      message: { id: 'm', model: '<synthetic>', usage: { input_tokens: 0, output_tokens: 0 } },
    })
    const event = await new ClaudeCodeJsonlParser().parseLine(line)
    expect(event!.costUsd).toBe(0)
  })

  it('leaves cost null for a model it genuinely cannot price', async () => {
    // null, not 0 — the UI reports how many events were excluded rather than
    // quietly under-reporting the bill
    const line = assistantLine({
      message: { id: 'm', model: 'some-future-model', usage: { input_tokens: 100, output_tokens: 5 } },
    })
    const event = await new ClaudeCodeJsonlParser().parseLine(line)
    expect(event!.costUsd).toBeNull()
  })

  it('never emits a path or any string content', async () => {
    const event = await new ClaudeCodeJsonlParser().parseLine(assistantLine())
    const serialised = JSON.stringify(event)
    expect(serialised).not.toContain('/Users/me/dev/app')
    expect(event!.scopeHash).toMatch(/^[0-9a-f]{16}$/)
    for (const v of Object.values(event!.meta)) expect(typeof v).toBe('number')
  })

  it('attributes diff line counts to the next priced turn', async () => {
    const parser = new ClaudeCodeJsonlParser()
    const patch = JSON.stringify({
      type: 'user',
      sessionId: 'sess-1',
      toolUseResult: {
        structuredPatch: [{ lines: ['+added', '+added2', '-removed', ' context'] }],
      },
    })
    expect(await parser.parseLine(patch)).toBeNull()

    const event = await parser.parseLine(assistantLine())
    expect(event!.meta.linesAdded).toBe(2)
    expect(event!.meta.linesRemoved).toBe(1)

    // counts are consumed, not repeated on the following turn
    const next = await parser.parseLine(assistantLine({ requestId: 'req_2' }))
    expect(next!.meta.linesAdded).toBe(0)
  })

  it('marks subagent turns so sidechain spend can be told apart', async () => {
    const event = await new ClaudeCodeJsonlParser().parseLine(assistantLine({ isSidechain: true }))
    expect(event!.meta.sidechain).toBe(1)
  })

  it('skips records with no spend rather than throwing', async () => {
    const parser = new ClaudeCodeJsonlParser()
    expect(await parser.parseLine('')).toBeNull()
    expect(await parser.parseLine('{"type":"user"}')).toBeNull()
    expect(await parser.parseLine('{ this is not json')).toBeNull()
    expect(await parser.parseLine('{"type":"assistant"}')).toBeNull()
    // an unknown field is not an exception
    expect(await parser.parseLine(assistantLine({ someFutureField: { a: 1 } }))).not.toBeNull()
  })
})

describe('countPatchLines', () => {
  it('counts +/- and ignores context', () => {
    expect(countPatchLines([{ lines: ['+a', '-b', ' c', '+d'] }])).toEqual({ added: 2, removed: 1 })
  })
  it('tolerates missing hunks', () => {
    expect(countPatchLines(undefined)).toEqual({ added: 0, removed: 0 })
    expect(countPatchLines([{}])).toEqual({ added: 0, removed: 0 })
  })
})
