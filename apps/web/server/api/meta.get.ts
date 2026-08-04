/** Everything the shell needs to render filters and the empty state. */
export default defineEventHandler(() => {
  const q = queries()
  const bounds = q.bounds()

  return {
    bounds,
    scopes: q.scopeLabels(),
    providers: q.byProvider({}).map(p => ({ provider: p.provider, events: p.events })),
    models: q.byUnitLabel({}).map(m => ({ unitLabel: m.unitLabel, events: m.events })),
    limitWindows: q.limitWindows(),
    dbPath: store().path,
  }
})
