import { checkAlerts, loadAlertsConfig } from '@nomnomtokens/db'

/** Current alert thresholds and which ones are firing right now. */
export default defineEventHandler(() => {
  const { config, path, exists } = loadAlertsConfig()
  const { hits, todayCostUsd } = checkAlerts(queries(), config)
  return { config, path, exists, hits, todayCostUsd, now: Date.now() }
})
