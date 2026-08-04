export default defineEventHandler((event) => {
  const filters = readFilters(event)
  const granularity = readGranularity(event)
  const groupByRaw = getQuery(event).groupBy
  const groupBy = groupByRaw === 'unitLabel' || groupByRaw === 'provider' || groupByRaw === 'scopeHash'
    ? groupByRaw
    : undefined

  const rows = queries().series(granularity, filters, groupBy)

  return {
    granularity,
    groupBy: groupBy ?? null,
    // Distinct series keys, so the chart can assign stable colours without a
    // second pass over the rows on the client.
    groups: groupBy ? [...new Set(rows.map(r => r.group ?? 'unknown'))] : [],
    rows,
  }
})
