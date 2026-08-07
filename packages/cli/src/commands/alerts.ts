import { spawnSync } from 'node:child_process'
import { platform } from 'node:os'
import type { AlertHit, AlertsConfig } from '@nomnomtokens/core'
import {
  checkAlerts,
  loadAlertsConfig,
  openDb,
  Queries,
  saveAlertsConfig,
} from '@nomnomtokens/db'
import { c, usd } from '../format.js'

export interface AlertsCheckOptions {
  db?: string
  notify?: boolean
  webhook?: string
  quiet?: boolean
}

/**
 * `nnt alerts show` — print thresholds and whether the config file exists.
 */
export function alertsShow(): void {
  const { config, path, exists } = loadAlertsConfig()
  console.log(c.bold('Alerts'))
  console.log(`  file          ${exists ? path : `${path} ${c.dim('(defaults — not written yet)')}`}`)
  console.log(`  limitPct      ${config.limitPct === null ? c.dim('off') : `${config.limitPct}%`}`)
  console.log(`  dailyUsd      ${config.dailyUsd === null ? c.dim('off') : usd(config.dailyUsd)}`)
  console.log(`  webhook       ${config.webhook ?? c.dim('none')}`)
  console.log(`  desktopNotify ${config.desktopNotify ? 'on' : 'off'}`)
  console.log()
  console.log(c.dim('Edit the JSON, or POST /api/alerts from the dashboard. Then: nnt alerts check'))
}

/**
 * `nnt alerts check` — evaluate thresholds against the local store.
 */
export async function alertsCheck(opts: AlertsCheckOptions = {}): Promise<AlertHit[]> {
  const { config, path, exists } = loadAlertsConfig()
  if (!exists) {
    // First run: persist defaults so the threshold is discoverable.
    saveAlertsConfig(config, path)
  }

  const { sqlite } = openDb(opts.db)
  const q = new Queries(sqlite)
  const { hits, todayCostUsd } = checkAlerts(q, config)
  sqlite.close()

  if (!opts.quiet) {
    if (hits.length === 0) {
      console.log(
        `${c.cyan('alerts')}  ${c.green('ok')}  `
        + c.dim(`today ${usd(todayCostUsd)} · no thresholds crossed`),
      )
    } else {
      console.log(`${c.cyan('alerts')}  ${c.red(`${hits.length} firing`)}`)
      for (const hit of hits) {
        console.log(`  ${c.yellow('!')} ${hit.message}`)
      }
    }
  }

  const shouldNotify = opts.notify || config.desktopNotify || Boolean(opts.webhook || config.webhook)
  if (shouldNotify && hits.length > 0) {
    const webhook = opts.webhook ?? config.webhook
    if (webhook) await postWebhook(webhook, hits, config)
    if (opts.notify || config.desktopNotify) desktopNotify(hits)
  }

  if (hits.length > 0) process.exitCode = 2
  return hits
}

async function postWebhook(url: string, hits: AlertHit[], config: AlertsConfig): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        source: 'nomnomtokens',
        firedAt: new Date().toISOString(),
        hits,
        config: { limitPct: config.limitPct, dailyUsd: config.dailyUsd },
      }),
    })
    if (!res.ok) {
      console.error(c.dim(`webhook ${url}: HTTP ${res.status}`))
    }
  } catch (err) {
    console.error(c.dim(`webhook failed: ${err instanceof Error ? err.message : String(err)}`))
  }
}

function desktopNotify(hits: AlertHit[]): void {
  const title = 'nomnomtokens'
  const body = hits.map(h => h.message).join('\n')
  const os = platform()

  try {
    if (os === 'darwin') {
      const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`
      spawnSync('osascript', ['-e', script], { stdio: 'ignore' })
    } else if (os === 'linux') {
      spawnSync('notify-send', [title, body], { stdio: 'ignore' })
    }
  } catch {
    // Notification is best-effort.
  }
}
