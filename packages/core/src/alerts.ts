/**
 * Threshold alerts — limit window fill and daily spend.
 * Config lives on disk; evaluation is pure so CLI and the dashboard share it.
 */

export interface AlertsConfig {
  /** Fire when any limit window's latest usedPct is at or above this (0–100). */
  limitPct: number | null
  /** Fire when today's token spend (USD) is at or above this. */
  dailyUsd: number | null
  /** Optional POST target for `nnt alerts check --notify`. */
  webhook: string | null
  /** Ask the OS for a desktop notification when checking with --notify. */
  desktopNotify: boolean
}

export const DEFAULT_ALERTS_CONFIG: AlertsConfig = {
  limitPct: 80,
  dailyUsd: null,
  webhook: null,
  desktopNotify: false,
}

export type AlertKind = 'limit' | 'daily'

export interface AlertHit {
  id: string
  kind: AlertKind
  message: string
  value: number
  threshold: number
  provider?: string
  window?: string
}

export interface AlertEvalInput {
  todayCostUsd: number
  limits: Array<{ provider: string, window: string, usedPct: number }>
}

export function parseAlertsConfig(raw: unknown): AlertsConfig {
  const base = { ...DEFAULT_ALERTS_CONFIG }
  if (!raw || typeof raw !== 'object') return base
  const o = raw as Record<string, unknown>

  if (o.limitPct === null) base.limitPct = null
  else if (typeof o.limitPct === 'number' && Number.isFinite(o.limitPct)) {
    base.limitPct = Math.min(100, Math.max(0, o.limitPct))
  }

  if (o.dailyUsd === null) base.dailyUsd = null
  else if (typeof o.dailyUsd === 'number' && Number.isFinite(o.dailyUsd) && o.dailyUsd >= 0) {
    base.dailyUsd = o.dailyUsd
  }

  if (o.webhook === null) base.webhook = null
  else if (typeof o.webhook === 'string' && o.webhook.trim()) base.webhook = o.webhook.trim()

  if (typeof o.desktopNotify === 'boolean') base.desktopNotify = o.desktopNotify

  return base
}

export function evaluateAlerts(config: AlertsConfig, input: AlertEvalInput): AlertHit[] {
  const hits: AlertHit[] = []

  if (config.limitPct !== null) {
    for (const lim of input.limits) {
      if (lim.usedPct >= config.limitPct) {
        hits.push({
          id: `limit:${lim.provider}:${lim.window}`,
          kind: 'limit',
          message: `${lim.provider} ${lim.window} window at ${lim.usedPct.toFixed(1)}% `
            + `(threshold ${config.limitPct}%)`,
          value: lim.usedPct,
          threshold: config.limitPct,
          provider: lim.provider,
          window: lim.window,
        })
      }
    }
  }

  if (config.dailyUsd !== null && input.todayCostUsd >= config.dailyUsd) {
    hits.push({
      id: 'daily:usd',
      kind: 'daily',
      message: `Today's spend $${input.todayCostUsd.toFixed(2)} `
        + `(threshold $${config.dailyUsd.toFixed(2)})`,
      value: input.todayCostUsd,
      threshold: config.dailyUsd,
    })
  }

  return hits
}
