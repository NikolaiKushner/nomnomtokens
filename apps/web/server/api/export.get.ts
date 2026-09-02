import { formatExportCsv, formatExportJson, formatNntArchive } from '@nomnomtokens/core'

/**
 * Download the filtered event set as CSV, JSON, or an nnt archive.
 * Query: same filter params as /api/stats/* plus `format=csv|json|nnt`.
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const format = q.format === 'json' || q.format === 'nnt' ? q.format : 'csv'
  const stamp = new Date().toISOString().slice(0, 10)

  if (format === 'nnt') {
    const db = queries()
    const body = formatNntArchive({
      version: 1,
      events: db.exportSpendEvents(),
      limits: db.limitSnapshots(),
      scopes: db.scopeLabels().map(s => ({
        scopeHash: s.scopeHash,
        label: s.label,
        provider: s.provider,
        lastSeen: s.lastSeen,
        client: s.client,
        labelLocked: s.labelLocked,
      })),
    })
    setHeader(event, 'content-type', 'application/json; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename="nomnomtokens-${stamp}.nnt.json"`)
    return body
  }

  const filters = readFilters(event)
  const { range: _range, ...f } = filters
  const rows = queries().exportEvents({ ...f, kind: f.kind ?? 'tokens' })
  const body = format === 'json' ? formatExportJson(rows) : formatExportCsv(rows)
  setHeader(event, 'content-type', format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8')
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="nomnomtokens-${stamp}.${format}"`,
  )
  return body
})
