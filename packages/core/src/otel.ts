/**
 * Map stored spend into an OTLP/HTTP JSON payload (application/json).
 *
 * Numbers and hashes only — no project labels unless the caller opts in.
 * This is an exporter, not a receiver: nothing listens.
 */

export interface OtelEvent {
  ts: number
  provider: string
  unitLabel: string | null
  scopeHash: string
  costUsd: number | null
  tokens: number
  label?: string | null
}

export interface OtelOptions {
  includeLabels?: boolean
  serviceName?: string
}

interface OtelKv {
  key: string
  value: { stringValue: string }
}

function attr(key: string, value: string): OtelKv {
  return { key, value: { stringValue: value } }
}

function nano(ts: number): string {
  return `${BigInt(Math.max(0, Math.round(ts))) * 1_000_000n}`
}

/**
 * One OTLP resourceMetrics blob. Callers POST it to an OTLP HTTP endpoint
 * (`/v1/metrics`) — we do not open a socket here.
 */
export function eventsToOtlp(events: OtelEvent[], opts: OtelOptions = {}): unknown {
  const costPoints = []
  const tokenPoints = []

  for (const e of events) {
    const attributes: OtelKv[] = [
      attr('provider', e.provider),
      attr('unit_label', e.unitLabel ?? 'unknown'),
      attr('scope_hash', e.scopeHash),
    ]
    if (opts.includeLabels && e.label) attributes.push(attr('project', e.label))

    const t = nano(e.ts)
    if (e.costUsd !== null && Number.isFinite(e.costUsd)) {
      costPoints.push({ asDouble: e.costUsd, timeUnixNano: t, attributes })
    }
    tokenPoints.push({ asDouble: e.tokens, timeUnixNano: t, attributes })
  }

  return {
    resourceMetrics: [{
      resource: {
        attributes: [attr('service.name', opts.serviceName ?? 'nomnomtokens')],
      },
      scopeMetrics: [{
        scope: { name: 'nomnomtokens' },
        metrics: [
          {
            name: 'nnt.cost_usd',
            unit: 'USD',
            sum: {
              dataPoints: costPoints,
              aggregationTemporality: 2,
              isMonotonic: true,
            },
          },
          {
            name: 'nnt.tokens',
            unit: '1',
            sum: {
              dataPoints: tokenPoints,
              aggregationTemporality: 2,
              isMonotonic: true,
            },
          },
        ],
      }],
    }],
  }
}
