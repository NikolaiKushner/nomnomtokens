import { buildVerdict } from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c, pct, usd } from '../format.js'

export interface VerdictOptions {
  db?: string
  json?: boolean
}

/**
 * `nnt verdict` — which named plan your weekly fill actually needs.
 */
export function verdictCommand(opts: VerdictOptions = {}): void {
  const now = Date.now()
  const weekFrom = now - 7 * 24 * 3_600_000
  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)
  const weekly = q.limitSnapshots('claude-code', '7d', weekFrom)
  const fiveHour = q.limitSnapshots('claude-code', '5h', weekFrom)
  const weeklyCostUsd = q.totals({ from: weekFrom, to: now, kind: 'tokens', provider: ['claude-code'] }).costUsd
  sqlite.close()

  const report = buildVerdict({ weekly, fiveHour, weeklyCostUsd, now })

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  console.log(c.bold('Verdict'))
  console.log(c.dim(`from ${dbPath}`))
  console.log()
  console.log(`  recommended  ${c.bold(report.recommended)}`)
  console.log(`  weekly bound ${report.weeklyBound ? 'yes' : 'no'}`)
  console.log(`  7d used      ${pct(report.weeklyUsedPct)}`)
  console.log(`  5h used      ${pct(report.fiveHourUsedPct)}`)
  console.log(`  week $       ${usd(report.weeklyCostUsd)}  ${c.dim('(list price, this machine)')}`)
  console.log()
  console.log(c.bold('Two Max 5x vs one 20x'))
  console.log(`  ${report.two5xVs20x.two5xWins ? c.yellow('two 5x wins') : '20x wins the 5h burst'}`)
  console.log(`  ${c.dim(report.two5xVs20x.reason)}`)
  console.log()
  console.log(c.bold('Caveats'))
  for (const line of report.caveats) {
    console.log(`  • ${line}`)
  }
}
