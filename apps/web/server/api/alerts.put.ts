import { parseAlertsConfig, type AlertsConfig } from '@nomnomtokens/core'
import { checkAlerts, defaultAlertsPath, saveAlertsConfig } from '@nomnomtokens/db'

/** Update ~/.nomnomtokens/alerts.json from the dashboard. */
export default defineEventHandler(async (event) => {
  const body = await readBody<Partial<AlertsConfig>>(event)
  const config = parseAlertsConfig(body)
  const path = defaultAlertsPath()
  saveAlertsConfig(config, path)
  const { hits, todayCostUsd } = checkAlerts(queries(), config)
  return { config, path, exists: true, hits, todayCostUsd, now: Date.now() }
})
