import { formatExportCsv, formatExportJson } from '@nomnomtokens/core'

/**
 * Download the filtered event set as CSV or JSON.
 * Query: same filter params as /api/stats/* plus `format=csv|json`.
 */
export default defineEventHandler((event) => {
  const q = getQuery(event)
  const format = q.format === 'json' ? 'json' : 'csv'
  const filters = readFilters(event)
  const { range: _range, ...f } = filters
  const rows = queries().exportEvents({ ...f, kind: f.kind ?? 'tokens' })

  const body = format === 'json' ? formatExportJson(rows) : formatExportCsv(rows)
  const stamp = new Date().toISOString().slice(0, 10)
  setHeader(event, 'content-type', format === 'json' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8')
  setHeader(
    event,
    'content-disposition',
    `attachment; filename="nomnomtokens-${stamp}.${format}"`,
  )
  return body
})
