import { describe, expect, it } from 'vitest'
import { CodexRolloutParser, labelFromCwd, windowLabel } from './parse.js'

function line(obj: unknown): string {
  return JSON.stringify(obj)
}

describe('windowLabel', () => {
  it('maps known Codex windows', () => {
    expect(windowLabel(300)).toBe('5h')
    expect(windowLabel(10080)).toBe('7d')
    expect(windowLabel(43200)).toBe('30d')
    expect(windowLabel(90)).toBe('90m')
  })
})

describe('labelFromCwd', () => {
  it('keeps only the last path segment', () => {
    expect(labelFromCwd('/Users/me/dev/fixture-app')).toBe('fixture-app')
    expect(labelFromCwd('C:\\Users\\me\\dev\\fixture-app')).toBe('fixture-app')
  })
})

describe('CodexRolloutParser', () => {
  it('emits a priced turn from last_token_usage and ignores message text', async () => {
    const parser = new CodexRolloutParser()
    await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:00.000Z',
      type: 'session_meta',
      payload: {
        session_id: 'sess-1',
        cwd: '/Users/me/dev/fixture-app',
      },
    }))
    await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:01.000Z',
      type: 'turn_context',
      payload: { model: 'gpt-5.6-terra', cwd: '/Users/me/dev/fixture-app' },
    }))

    const records = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 400,
            cache_write_input_tokens: 0,
            output_tokens: 50,
            reasoning_output_tokens: 10,
            total_tokens: 1050,
          },
          last_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 400,
            cache_write_input_tokens: 0,
            output_tokens: 50,
            reasoning_output_tokens: 10,
            total_tokens: 1050,
          },
        },
        rate_limits: {
          primary: { used_percent: 1.5, window_minutes: 43200, resets_at: 1780000000 },
          secondary: null,
        },
      },
    }))

    expect(records).toHaveLength(2)
    expect(records[0]).toMatchObject({
      type: 'limit',
      limit: { provider: 'codex', window: '30d', usedPct: 1.5, resetsAt: 1780000000_000 },
    })

    const event = records[1]
    expect(event?.type).toBe('event')
    if (event?.type !== 'event') return

    expect(event.event.id).toBe('codex:sess-1:1000:50')
    expect(event.event.provider).toBe('codex')
    expect(event.event.unitLabel).toBe('gpt-5.6-terra')
    expect(event.event.qty).toEqual({
      in: 600,
      out: 50,
      cacheCreate: 0,
      cacheCreate1h: 0,
      cacheRead: 400,
    })
    expect(event.event.meta).toEqual({ reasoningOutputTokens: 10 })
    expect(parser.scopeLabel()).toBe('fixture-app')

    // Privacy: no absolute path or prompt text in the emitted JSON.
    const blob = JSON.stringify(event.event)
    expect(blob).not.toContain('/Users/me')
    expect(blob).not.toContain('fixture-app')
    for (const v of Object.values(event.event.meta)) {
      expect(typeof v).toBe('number')
    }
  })

  it('dedups by cumulative totals, not by timestamp', async () => {
    const parser = new CodexRolloutParser()
    await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:00.000Z',
      type: 'session_meta',
      payload: { session_id: 'sess-1', cwd: '/tmp/x' },
    }))

    const a = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:02.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 },
          last_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 },
        },
      },
    }))
    const b = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:03.000Z',
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          total_token_usage: { input_tokens: 250, output_tokens: 30, cached_input_tokens: 0 },
          last_token_usage: { input_tokens: 150, output_tokens: 20, cached_input_tokens: 0 },
        },
      },
    }))

    const ea = a.find(r => r.type === 'event')
    const eb = b.find(r => r.type === 'event')
    expect(ea?.type === 'event' && ea.event.id).toBe('codex:sess-1:100:10')
    expect(eb?.type === 'event' && eb.event.id).toBe('codex:sess-1:250:30')
  })

  it('skips unknown lines and content-bearing records', async () => {
    const parser = new CodexRolloutParser()
    const empty = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:00.000Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'text', text: 'do not store me' }],
      },
    }))
    expect(empty).toEqual([])
  })

  it('emits a limit only when usedPct or resetsAt changes', async () => {
    const parser = new CodexRolloutParser()
    await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:00.000Z',
      type: 'session_meta',
      payload: { session_id: 'sess-1', cwd: '/tmp/x' },
    }))

    const limitPayload = {
      type: 'token_count',
      info: {
        total_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 },
        last_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 },
      },
      rate_limits: {
        primary: { used_percent: 2, window_minutes: 43200, resets_at: 1780000000 },
      },
    }

    const first = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:02.000Z',
      type: 'event_msg',
      payload: limitPayload,
    }))
    const second = await parser.parseLine(line({
      timestamp: '2026-08-07T11:00:03.000Z',
      type: 'event_msg',
      payload: {
        ...limitPayload,
        info: {
          total_token_usage: { input_tokens: 200, output_tokens: 20, cached_input_tokens: 0 },
          last_token_usage: { input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 },
        },
      },
    }))

    expect(first.filter(r => r.type === 'limit')).toHaveLength(1)
    expect(second.filter(r => r.type === 'limit')).toHaveLength(0)
  })
})
