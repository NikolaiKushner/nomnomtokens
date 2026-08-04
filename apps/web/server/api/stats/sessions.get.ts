export default defineEventHandler((event) => {
  const filters = readFilters(event)
  const limit = Number.parseInt(String(getQuery(event).limit ?? '200'), 10)

  return {
    rows: queries().sessions(filters, Number.isFinite(limit) ? Math.min(limit, 1000) : 200),
  }
})
