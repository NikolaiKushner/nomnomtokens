import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_ALERTS_CONFIG,
  bucketStart,
  evaluateAlerts,
  forecastLimit,
  parseAlertsConfig,
  type AlertHit,
  type AlertsConfig,
} from '@nomnomtokens/core'
import { defaultDataDir } from './client.js'
import type { Queries } from './queries.js'

export function defaultAlertsPath(): string {
  return join(defaultDataDir(), 'alerts.json')
}

export function loadAlertsConfig(path: string = defaultAlertsPath()): {
  config: AlertsConfig
  path: string
  exists: boolean
} {
  if (!existsSync(path)) {
    return { config: { ...DEFAULT_ALERTS_CONFIG }, path, exists: false }
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return { config: parseAlertsConfig(raw), path, exists: true }
  } catch {
    return { config: { ...DEFAULT_ALERTS_CONFIG }, path, exists: false }
  }
}

export function saveAlertsConfig(config: AlertsConfig, path: string = defaultAlertsPath()): void {
  mkdirSync(defaultDataDir(), { recursive: true })
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

/** Latest usedPct per (provider, window), then apply thresholds. */
export function checkAlerts(q: Queries, config?: AlertsConfig, now = Date.now()): {
  config: AlertsConfig
  hits: AlertHit[]
  todayCostUsd: number
} {
  const cfg = config ?? loadAlertsConfig().config
  const todayCostUsd = q.totals({ from: bucketStart(now, 'day'), kind: 'tokens' }).costUsd

  const limits = q.limitWindows().map((w) => {
    const snapshots = q.limitSnapshots(w.provider, w.window, now - 14 * 24 * 3_600_000)
    const forecast = forecastLimit(snapshots, now)
    return forecast
      ? { provider: forecast.provider, window: forecast.window, usedPct: forecast.usedPct }
      : null
  }).filter((x): x is { provider: string, window: string, usedPct: number } => x !== null)

  return {
    config: cfg,
    hits: evaluateAlerts(cfg, { todayCostUsd, limits }),
    todayCostUsd,
  }
}
