import { buildAuditReport } from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c, compactNumber, pct, usd } from '../format.js'

export interface AuditOptions {
  db?: string
  /** Calendar days back from local midnight of today. Default 7. */
  days?: number
  json?: boolean
  quiet?: boolean
}

function rangeFromDays(days: number, now = Date.now()): { from: number, to: number } {
  const to = now
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (days - 1))
  return { from: start.getTime(), to }
}

function formatGap(ms: number): string {
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`
  return `${hours}h`
}

/**
 * `nnt audit` — where spend went in a range: cache, subagents, models, tips.
 */
export function auditCommand(opts: AuditOptions = {}): void {
  const days = opts.days && opts.days > 0 ? opts.days : 7
  const { from, to } = rangeFromDays(days)
  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)

  const filters = { from, to, kind: 'tokens' as const }
  const totals = q.totals(filters)
  const sidechain = q.sidechainTotals(filters)
  const models = q.byUnitLabel(filters)
  const sessions = q.sessionsAudit(filters, 5)
  const coldResumes = q.coldResumesFor(sessions)
  sqlite.close()

  const report = buildAuditReport({
    range: { from, to },
    totals: {
      costUsd: totals.costUsd,
      tokens: totals.tokens,
      events: totals.events,
      qtyIn: totals.qtyIn,
      qtyCacheRead: totals.qtyCacheRead,
    },
    sidechain: {
      taggedEvents: sidechain.taggedEvents,
      costUsd: sidechain.costUsd,
      tokens: sidechain.tokens,
    },
    models: models.map(m => ({ unitLabel: m.unitLabel, costUsd: m.costUsd })),
    sessions: sessions.map(s => ({
      sessionId: s.sessionId,
      label: s.label,
      costUsd: s.costUsd,
      sidechainCostUsd: s.sidechainCostUsd,
      sidechainTagged: s.sidechainTagged,
    })),
    coldResumes,
  })

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  console.log(c.bold(`Audit · last ${days}d`))
  console.log(c.dim(`from ${dbPath}`))
  console.log()
  console.log(`  cost         ${usd(report.totals.costUsd)}`)
  console.log(`  tokens       ${compactNumber(report.totals.tokens)}`)
  console.log(`  events       ${report.totals.events}`)
  console.log(`  cache hit    ${pct(report.cache.hitRate !== null ? report.cache.hitRate * 100 : null)}`)
  console.log(
    `  subagents    ${
      report.sidechain.tagged
        ? `${pct(report.sidechain.shareOfCost !== null ? report.sidechain.shareOfCost * 100 : null)} · ${usd(report.sidechain.costUsd)}`
        : `${c.dim('n/a')} (Claude Code only)`
    }`,
  )
  console.log()

  if (report.models.length) {
    console.log(c.bold('Models'))
    for (const m of report.models.slice(0, 5)) {
      const label = (m.unitLabel ?? 'unknown').padEnd(28)
      console.log(`  ${label} ${pct(m.share * 100).padStart(5)}  ${usd(m.costUsd)}`)
    }
    console.log()
  }

  if (report.topSessions.length) {
    console.log(c.bold('Top sessions'))
    for (const s of report.topSessions) {
      const name = (s.label ?? s.sessionId.slice(0, 12)).padEnd(28)
      const sc = s.sidechainShare !== null
        ? ` · sub ${pct(s.sidechainShare * 100)}`
        : ''
      console.log(`  ${name} ${usd(s.costUsd)}${sc}`)
    }
    console.log()
  }

  if (report.coldResumes.length) {
    console.log(c.bold('Cold resumes'))
    for (const hit of report.coldResumes) {
      const name = (hit.label ?? hit.sessionId.slice(0, 12)).padEnd(28)
      console.log(`  ${name} ${usd(hit.costUsd)} after ${formatGap(hit.gapMs)} idle`)
    }
    console.log()
  }

  if (report.tips.length) {
    console.log(c.bold('Tips'))
    for (const tip of report.tips) {
      console.log(`  • ${tip}`)
    }
    console.log()
  }

  if (!opts.quiet && report.totals.events === 0) {
    console.log(c.dim('No token events in this range. Run `nnt scan`, then try again.'))
  }
}
