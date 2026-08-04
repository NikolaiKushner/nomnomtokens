export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'session id required' })

  const q = queries()
  const events = q.sessionEvents(id)
  if (events.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'no events for that session' })
  }

  return {
    sessionId: id,
    totals: q.totals({ sessionId: id, kind: 'tokens' }),
    lines: q.lineTotals({ sessionId: id, kind: 'tokens' }),
    events,
  }
})
