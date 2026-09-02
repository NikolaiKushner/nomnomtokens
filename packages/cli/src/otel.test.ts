import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, Repo } from '@nomnomtokens/db'
import { otelCommand } from './commands/otel.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nnt otel', () => {
  it('POSTs OTLP/HTTP JSON to the endpoint and not from scan', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nnt-otel-'))
    const db = join(dir, 'data.db')
    const { sqlite } = openDb(db)
    new Repo(sqlite).ingest([{
      type: 'event',
      event: {
        id: 'e1',
        ts: Date.now(),
        provider: 'claude-code',
        kind: 'tokens',
        sessionId: 's',
        scopeHash: 'abcdabcdabcdabcd',
        unitLabel: 'claude-sonnet-4-5',
        qty: { in: 10, out: 5, cacheCreate: 0, cacheCreate1h: 0, cacheRead: 0 },
        costUsd: 0.02,
        meta: {},
      },
    }])
    sqlite.close()

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' })
    vi.stubGlobal('fetch', fetchMock)

    await otelCommand({ db, endpoint: 'http://127.0.0.1:4318', quiet: true })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:4318/v1/metrics')
    expect(init.method).toBe('POST')
    const body = JSON.parse(String(init.body)) as { resourceMetrics: unknown[] }
    expect(JSON.stringify(body)).toContain('nnt.cost_usd')
    expect(JSON.stringify(body)).toContain('abcdabcdabcdabcd')
    expect(JSON.stringify(body)).not.toContain('project')
  })

  it('exits 1 when the collector is down', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nnt-otel-'))
    const db = join(dir, 'data.db')
    openDb(db).sqlite.close()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    }))

    const prev = process.exitCode
    await otelCommand({ db, endpoint: 'http://127.0.0.1:9', quiet: true })
    expect(process.exitCode).toBe(1)
    process.exitCode = prev
  })
})
