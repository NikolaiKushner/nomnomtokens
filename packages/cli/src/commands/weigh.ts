import { buildWeigh, pairRisingSnapshots, type WeighModel, type WeighReport } from '@nomnomtokens/core'
import { openDb, Queries } from '@nomnomtokens/db'
import { c } from '../format.js'

export interface WeighOptions {
  db?: string
  json?: boolean
}

/**
 * `nnt weigh` — weekly limit points per list-price dollar, from clean gaps.
 */
export function weighCommand(opts: WeighOptions = {}): void {
  const { sqlite, path: dbPath } = openDb(opts.db)
  const q = new Queries(sqlite)
  const snaps = q.limitSnapshots('claude-code', '7d')
  const gaps = pairRisingSnapshots(snaps).map(p => ({
    deltaPct: p.deltaPct,
    models: q.byUnitLabel({
      from: p.from,
      to: p.to,
      provider: ['claude-code'],
      kind: 'tokens',
    })
      .filter(row => row.costUsd > 0)
      .map(row => ({ unitLabel: row.unitLabel, costUsd: row.costUsd })),
  }))
  sqlite.close()

  const report = buildWeigh(gaps)

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  printWeigh(report, dbPath)
}

function printWeigh(report: WeighReport, dbPath: string): void {
  console.log(c.bold('Weigh'))
  console.log(c.dim(`from ${dbPath}`))
  console.log()
  console.log(`  window    ${report.provider} ${report.window}`)
  console.log(`  blended   ${pp(report.blendedPpPerUsd)}  ${c.dim('per list-price dollar, all rising gaps')}`)
  console.log(`  gaps      ${report.cleanIntervals} clean / ${report.risingIntervals} rising`)
  console.log()
  console.log(c.bold('Models'))
  if (report.models.length === 0) {
    console.log(c.dim('  no priced gaps in the current 7d window — run `nnt init` so the status line records weekly fill'))
  }
  for (const model of report.models) console.log(modelLine(model))
  console.log()
  console.log(c.bold('Caveats'))
  for (const line of report.caveats) console.log(`  • ${line}`)
}

function modelLine(model: WeighModel): string {
  const name = model.unitLabel ?? '(unlabeled)'
  if (model.status === 'unknown' || !model.ppPerUsd) {
    return `  ${name}  ${c.yellow('unknown')}  ${c.dim(`need 3 clean gaps, have ${model.cleanIntervals}`)}`
  }
  const { p25, median, p75 } = model.ppPerUsd
  return `  ${name}  ${pp(median)}  ${c.dim(`p25 ${pp(p25)}  p75 ${pp(p75)}  ${model.cleanIntervals} gaps`)}`
}

function pp(n: number | null): string {
  if (n === null) return '—'
  return `${n.toFixed(2)} pp/$`
}
