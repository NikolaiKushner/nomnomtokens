#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { alertsCheck, alertsShow } from './commands/alerts.js'
import { doctor } from './commands/doctor.js'
import { exportCommand } from './commands/export.js'
import { importCsvCommand } from './commands/import-csv.js'
import { init } from './commands/init.js'
import { pricesRefresh, pricesShow } from './commands/prices.js'
import { scan } from './commands/scan.js'
import { serve } from './commands/serve.js'
import { statusline } from './commands/statusline.js'

/** Walk up from this file until we find the published root package.json. */
function packageVersion(): string {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 8; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string
        version?: string
      }
      if (pkg.name === 'nomnomtokens' && pkg.version) return pkg.version
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return '0.0.0'
}

const program = new Command()

program
  .name('nnt')
  .description('nom nom nom — your agent is eating tokens. The dashboard shows exactly how many.')
  .version(packageVersion())
  .option('--db <path>', 'database file (default: ~/.nomnomtokens/data.db)')

program
  .command('scan', { isDefault: false })
  .description('read new records from every detected source into the local store')
  .option('-w, --watch', 'stay running and ingest new records as they are written')
  .option('-q, --quiet', 'suppress the summary')
  .action(async (opts: { watch?: boolean, quiet?: boolean }) => {
    await scan({ ...opts, db: program.opts().db as string | undefined })
  })

program
  .command('serve')
  .description('scan, then open the dashboard')
  .option('-p, --port <port>', 'port to listen on', v => Number.parseInt(v, 10), 4269)
  .option('--no-open', 'do not open a browser')
  .option('--no-scan', 'skip the catch-up scan')
  .action(async (opts: { port: number, open: boolean, scan: boolean }) => {
    await serve({
      port: opts.port,
      open: opts.open,
      noScan: !opts.scan,
      db: program.opts().db as string | undefined,
    })
  })

program
  .command('init')
  .description('wire the statusline hook into ~/.claude/settings.json')
  .option('-f, --force', 'replace an existing status line')
  .option('-n, --dry-run', 'print the change without writing it')
  .option('--settings <path>', 'settings file to edit')
  .action((opts: { force?: boolean, dryRun?: boolean, settings?: string }) => {
    init(opts)
  })

program
  .command('statusline')
  .description('read Claude Code session JSON on stdin; record limits and print a status line')
  .option('-n, --dry-run', 'render without writing to the store')
  .action(async (opts: { dryRun?: boolean }) => {
    await statusline({ ...opts, db: program.opts().db as string | undefined })
  })

program
  .command('doctor')
  .description('check sources, hook wiring and the local store')
  .action(async () => {
    await doctor({ db: program.opts().db as string | undefined })
  })

program
  .command('import <file>')
  .description('import a CSV billing export or spreadsheet into the local store')
  .option('--provider <name>', 'provider label written on every row', 'csv')
  .option('--kind <kind>', 'event kind (tokens, minutes, …)', 'tokens')
  .option('-q, --quiet', 'suppress the summary')
  .action(async (
    file: string,
    opts: { provider?: string, kind?: string, quiet?: boolean },
  ) => {
    await importCsvCommand({
      file,
      provider: opts.provider,
      kind: opts.kind,
      quiet: opts.quiet,
      db: program.opts().db as string | undefined,
    })
  })

program
  .command('export')
  .description('write filtered events as CSV or JSON (stdout or -o file)')
  .option('--format <fmt>', 'csv or json', 'csv')
  .option('-o, --out <file>', 'write to a file instead of stdout')
  .option('--range <range>', '24h | 7d | 30d | 90d | all', '30d')
  .option('--provider <name>', 'filter to one provider')
  .option('-q, --quiet', 'suppress the summary on stderr')
  .action((opts: {
    format?: string
    out?: string
    range?: string
    provider?: string
    quiet?: boolean
  }) => {
    const format = opts.format === 'json' ? 'json' : 'csv'
    const range = (['24h', '7d', '30d', '90d', 'all'] as const).includes(opts.range as never)
      ? (opts.range as '24h' | '7d' | '30d' | '90d' | 'all')
      : '30d'
    exportCommand({
      format,
      out: opts.out,
      range,
      provider: opts.provider,
      quiet: opts.quiet,
      db: program.opts().db as string | undefined,
    })
  })

const prices = program
  .command('prices')
  .description('show or refresh the local model price table (~/.nomnomtokens/prices.json)')

prices
  .command('show', { isDefault: true })
  .description('print the effective price table and where it came from')
  .action(() => {
    pricesShow()
  })

prices
  .command('refresh')
  .description('write bundled prices to disk (or merge --from); used by scan/import')
  .option('--from <url|path>', 'merge prices from a JSON URL or local file (network only for http)')
  .option('-q, --quiet', 'suppress the summary')
  .action(async (opts: { from?: string, quiet?: boolean }) => {
    await pricesRefresh(opts)
  })

const alerts = program
  .command('alerts')
  .description('threshold alerts for limit windows and daily spend')

alerts
  .command('show', { isDefault: true })
  .description('print alert thresholds (~/.nomnomtokens/alerts.json)')
  .action(() => {
    alertsShow()
  })

alerts
  .command('check')
  .description('evaluate thresholds; exit 2 if any are firing')
  .option('--notify', 'desktop notification and/or configured webhook')
  .option('--webhook <url>', 'POST hits to this URL (overrides config)')
  .option('-q, --quiet', 'suppress the summary')
  .action(async (opts: { notify?: boolean, webhook?: string, quiet?: boolean }) => {
    await alertsCheck({
      ...opts,
      db: program.opts().db as string | undefined,
    })
  })

/**
 * `npx nomnomtokens` is the advertised entry point, so an invocation with no
 * subcommand means "open the dashboard" rather than "print help at someone who
 * just wanted the dashboard".
 *
 * That has to hold for `nnt --port 5000` too, not only for a bare `nnt` — the
 * flags belong to serve, and making the user type the word `serve` to use them
 * is the kind of papercut that gets a tool uninstalled. So: if the arguments
 * name no command and aren't asking for help, insert `serve`.
 */
const COMMANDS = new Set([
  'scan', 'serve', 'init', 'statusline', 'doctor', 'import', 'export', 'prices', 'alerts', 'help',
])
const META_FLAGS = new Set(['-h', '--help', '-V', '--version'])

const args = process.argv.slice(2)
const isImplicitServe
  = !args.some(arg => COMMANDS.has(arg))
    && !args.some(arg => META_FLAGS.has(arg))

await program.parseAsync(
  isImplicitServe ? [...process.argv.slice(0, 2), 'serve', ...args] : process.argv,
)
