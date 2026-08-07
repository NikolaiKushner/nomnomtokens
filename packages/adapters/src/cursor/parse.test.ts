import { describe, expect, it } from 'vitest'
import { eventsFromComposer, type CursorBubble, type CursorComposerInfo } from './parse.js'
import { labelFromWorkspacePath, pathFromFolderUri } from './paths.js'

const composer: CursorComposerInfo = {
  composerId: 'comp-1',
  model: 'claude-sonnet-4-5',
  linesAdded: 10,
  linesRemoved: 2,
}

function bubble(over: Partial<CursorBubble> & Pick<CursorBubble, 'bubbleId'>): CursorBubble {
  return {
    composerId: 'comp-1',
    createdAt: '2026-01-15T12:00:00.000Z',
    ...over,
  }
}

describe('eventsFromComposer', () => {
  it('emits exact tokenCount when present', () => {
    const events = eventsFromComposer(composer, [
      bubble({
        bubbleId: 'b1',
        tokenCount: { inputTokens: 1000, outputTokens: 200 },
      }),
    ], 'abc123')

    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe('cursor:comp-1:b1')
    expect(events[0]!.qty).toMatchObject({ in: 1000, out: 200 })
    expect(events[0]!.provider).toBe('cursor')
    expect(events[0]!.kind).toBe('tokens')
    expect(events[0]!.sessionId).toBe('comp-1')
    expect(events[0]!.unitLabel).toBe('claude-sonnet-4-5')
    expect(events[0]!.meta).toEqual({ linesAdded: 10, linesRemoved: 2 })
    expect(events[0]!.costUsd).not.toBeNull()
  })

  it('dedup keys on composerId + bubbleId', () => {
    const a = eventsFromComposer(composer, [
      bubble({ bubbleId: 'same', tokenCount: { inputTokens: 1, outputTokens: 1 } }),
    ], 'h')
    const b = eventsFromComposer(composer, [
      bubble({ bubbleId: 'same', tokenCount: { inputTokens: 9, outputTokens: 9 } }),
    ], 'h')
    expect(a[0]!.id).toBe(b[0]!.id)
  })

  it('uses tokensUsed + delta when no exact tokenCount exists', () => {
    const events = eventsFromComposer(composer, [
      bubble({
        bubbleId: 'u1',
        createdAt: '2026-01-15T12:00:00.000Z',
        contextWindowStatusAtCreation: { tokensUsed: 1000 },
      }),
      bubble({
        bubbleId: 'u2',
        createdAt: '2026-01-15T12:01:00.000Z',
        contextWindowStatusAtCreation: { tokensUsed: 1500 },
      }),
      bubble({
        bubbleId: 'u3',
        createdAt: '2026-01-15T12:02:00.000Z',
        contextWindowStatusAtCreation: { tokensUsed: 1800 },
      }),
    ], 'h')

    expect(events).toHaveLength(3)
    expect(events[0]!.qty).toMatchObject({ in: 1000, out: 500 })
    expect(events[1]!.qty).toMatchObject({ in: 1500, out: 300 })
    expect(events[2]!.qty).toMatchObject({ in: 1800, out: 0 })
  })

  it('prefers exact tokenCount and skips tokensUsed on the same composer', () => {
    const events = eventsFromComposer(composer, [
      bubble({
        bubbleId: 'user',
        createdAt: '2026-01-15T12:00:00.000Z',
        contextWindowStatusAtCreation: { tokensUsed: 50000 },
      }),
      bubble({
        bubbleId: 'asst',
        createdAt: '2026-01-15T12:00:05.000Z',
        tokenCount: { inputTokens: 100, outputTokens: 50 },
      }),
    ], 'h')

    expect(events).toHaveLength(1)
    expect(events[0]!.id).toBe('cursor:comp-1:asst')
    expect(events[0]!.qty).toMatchObject({ in: 100, out: 50 })
  })

  it('skips bubbles with no numeric signal', () => {
    const events = eventsFromComposer(composer, [
      bubble({ bubbleId: 'empty', tokenCount: { inputTokens: 0, outputTokens: 0 } }),
    ], 'h')
    expect(events).toHaveLength(0)
  })

  it('attaches composer line totals only once', () => {
    const events = eventsFromComposer(composer, [
      bubble({ bubbleId: 'a', tokenCount: { inputTokens: 1, outputTokens: 1 } }),
      bubble({
        bubbleId: 'b',
        createdAt: '2026-01-15T12:01:00.000Z',
        tokenCount: { inputTokens: 2, outputTokens: 2 },
      }),
    ], 'h')
    expect(events[0]!.meta).toEqual({ linesAdded: 10, linesRemoved: 2 })
    expect(events[1]!.meta).toEqual({ linesAdded: 0, linesRemoved: 0 })
  })

  it('never puts a path into the serialized event', () => {
    const events = eventsFromComposer(
      { ...composer, model: 'composer-2.5' },
      [
        bubble({
          bubbleId: 'b1',
          tokenCount: { inputTokens: 10, outputTokens: 5 },
        }),
      ],
      'deadbeef',
    )
    const json = JSON.stringify(events[0])
    expect(json).not.toMatch(/Users|\.ts|\/home\//)
    expect(typeof events[0]!.meta.linesAdded).toBe('number')
  })
})

describe('paths helpers', () => {
  it('strips file:// from folder URIs', () => {
    expect(pathFromFolderUri('file:///Users/me/dev/app')).toBe('/Users/me/dev/app')
  })

  it('labels from the last path segment', () => {
    expect(labelFromWorkspacePath('/Users/me/dev/nomnomtokens')).toBe('nomnomtokens')
  })
})
