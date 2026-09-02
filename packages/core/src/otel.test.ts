import { describe, expect, it } from 'vitest'
import { eventsToOtlp } from './otel.js'

describe('eventsToOtlp', () => {
  it('emits cost and token sums with hash attributes, not labels by default', () => {
    const body = eventsToOtlp([
      {
        ts: 1_700_000_000_000,
        provider: 'claude-code',
        unitLabel: 'claude-sonnet-4-5',
        scopeHash: 'abcdabcdabcdabcd',
        costUsd: 1.5,
        tokens: 4000,
        label: 'secret-client',
      },
    ]) as {
      resourceMetrics: Array<{
        scopeMetrics: Array<{
          metrics: Array<{ name: string, sum: { dataPoints: Array<{ attributes: Array<{ key: string, value: { stringValue: string } }> }> } }>
        }>
      }>
    }

    const metrics = body.resourceMetrics[0]!.scopeMetrics[0]!.metrics
    expect(metrics.map(m => m.name).sort()).toEqual(['nnt.cost_usd', 'nnt.tokens'])
    const keys = metrics[0]!.sum.dataPoints[0]!.attributes.map(a => a.key)
    expect(keys).toContain('scope_hash')
    expect(keys).not.toContain('project')
  })

  it('adds project labels only when opted in', () => {
    const body = eventsToOtlp([
      {
        ts: 1,
        provider: 'codex',
        unitLabel: null,
        scopeHash: 'x',
        costUsd: null,
        tokens: 10,
        label: 'acme',
      },
    ], { includeLabels: true }) as {
      resourceMetrics: Array<{
        scopeMetrics: Array<{
          metrics: Array<{ name: string, sum: { dataPoints: Array<{ attributes: Array<{ key: string, value: { stringValue: string } }> }> } }>
        }>
      }>
    }
    const token = body.resourceMetrics[0]!.scopeMetrics[0]!.metrics.find(m => m.name === 'nnt.tokens')
    const keys = token!.sum.dataPoints[0]!.attributes.map(a => `${a.key}=${a.value.stringValue}`)
    expect(keys).toContain('project=acme')
    expect(token!.sum.dataPoints[0]!.attributes.find(a => a.key === 'unit_label')?.value.stringValue).toBe('unknown')
  })
})
