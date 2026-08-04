export default defineEventHandler((event) => {
  const filters = readFilters(event)
  const cells = queries().heatmap(filters)

  // Fill the grid server-side: an hour with no activity must still render a
  // cell, or the heatmap develops holes instead of dark squares.
  const grid = new Map(cells.map(c => [`${c.weekday}:${c.hour}`, c]))
  const full = []
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      full.push(grid.get(`${weekday}:${hour}`) ?? { weekday, hour, costUsd: 0, tokens: 0, events: 0 })
    }
  }

  return {
    cells: full,
    max: {
      costUsd: Math.max(0, ...full.map(c => c.costUsd)),
      tokens: Math.max(0, ...full.map(c => c.tokens)),
      events: Math.max(0, ...full.map(c => c.events)),
    },
  }
})
