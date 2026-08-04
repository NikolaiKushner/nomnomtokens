#!/usr/bin/env node
import { Command } from 'commander'
import { doctor } from './commands/doctor.js'
import { init } from './commands/init.js'
import { scan } from './commands/scan.js'
import { serve } from './commands/serve.js'
import { statusline } from './commands/statusline.js'

const program = new Command()

program
  .name('nnt')
  .description('nom nom nom — your agent is eating tokens. The dashboard shows exactly how many.')
  .version('0.1.0')
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

// `npx nomnomtokens` with no arguments is the advertised entry point, and it
// should do the obvious thing rather than print help at someone who just
// wanted the dashboard.
if (process.argv.length <= 2) {
  await serve({})
} else {
  await program.parseAsync(process.argv)
}
