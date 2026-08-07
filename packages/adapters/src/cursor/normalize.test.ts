import { describe, expect, it } from 'vitest'
import { normalizeCursorModelName } from './db.js'

describe('normalizeCursorModelName', () => {
  it('drops Cursor Auto placeholders', () => {
    expect(normalizeCursorModelName('default')).toBeNull()
    expect(normalizeCursorModelName('DEFAULT')).toBeNull()
    expect(normalizeCursorModelName('default,default,default,default')).toBeNull()
    expect(normalizeCursorModelName(' default , default ')).toBeNull()
  })

  it('keeps real model ids', () => {
    expect(normalizeCursorModelName('grok-4.5')).toBe('grok-4.5')
    expect(normalizeCursorModelName('composer-2.5')).toBe('composer-2.5')
    expect(normalizeCursorModelName('claude-4.5-sonnet-thinking')).toBe('claude-4.5-sonnet-thinking')
  })

  it('treats empty as absent', () => {
    expect(normalizeCursorModelName('')).toBeNull()
    expect(normalizeCursorModelName(null)).toBeNull()
    expect(normalizeCursorModelName(undefined)).toBeNull()
  })
})
