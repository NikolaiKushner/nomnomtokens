import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema/sqlite.js'

export const SCHEMA_VERSION = 2

export function defaultDataDir(): string {
  return process.env.NOMNOMTOKENS_HOME ?? join(homedir(), '.nomnomtokens')
}

export function defaultDbPath(): string {
  return join(defaultDataDir(), 'data.db')
}

/**
 * DDL is hand-written rather than generated so that opening the database is a
 * single synchronous step with no migration runner in the npx path. The Drizzle
 * schema in schema/sqlite.ts is the query-building view of these same tables;
 * they must stay in sync, which `db.test.ts` asserts.
 */
const DDL = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  provider TEXT NOT NULL,
  kind TEXT NOT NULL,
  session_id TEXT,
  scope_hash TEXT NOT NULL,
  unit_label TEXT,
  qty_json TEXT NOT NULL,
  cost_usd REAL,
  meta_json TEXT NOT NULL,
  qty_total REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_scope ON events(scope_hash, ts);
CREATE INDEX IF NOT EXISTS idx_events_provider ON events(provider, ts);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, ts);

CREATE TABLE IF NOT EXISTS scopes (
  scope_hash TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  provider TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  client TEXT,
  label_locked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS limits (
  ts INTEGER NOT NULL,
  provider TEXT NOT NULL,
  window TEXT NOT NULL,
  used_pct REAL NOT NULL,
  resets_at INTEGER,
  PRIMARY KEY (provider, window, ts)
);
CREATE INDEX IF NOT EXISTS idx_limits_lookup ON limits(provider, window, ts);

CREATE TABLE IF NOT EXISTS scan_state (
  source_path TEXT PRIMARY KEY,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL,
  offset INTEGER NOT NULL
);
`

export interface DbHandle {
  db: ReturnType<typeof drizzle<typeof schema>>
  sqlite: BetterSqlite3.Database
  path: string
}

export type Db = DbHandle['db']

function migrate(sqlite: BetterSqlite3.Database, from: number): void {
  if (from < 2) {
    const cols = sqlite.pragma('table_info(scopes)') as Array<{ name: string }>
    const names = new Set(cols.map(c => c.name))
    if (!names.has('client')) sqlite.exec('ALTER TABLE scopes ADD COLUMN client TEXT')
    if (!names.has('label_locked')) {
      sqlite.exec('ALTER TABLE scopes ADD COLUMN label_locked INTEGER NOT NULL DEFAULT 0')
    }
  }
}

export function openDb(path: string = defaultDbPath()): DbHandle {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })

  const sqlite = new Database(path)
  // WAL keeps `nnt serve` reading while a scan writes — without it the dashboard
  // freezes for the duration of every scan.
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(DDL)

  const found = (sqlite.pragma('user_version', { simple: true }) as number) ?? 0
  if (found === 0) sqlite.pragma(`user_version = ${SCHEMA_VERSION}`)
  else if (found > SCHEMA_VERSION) {
    throw new Error(
      `Database at ${path} was written by a newer nomnomtokens (schema v${found}, this build understands v${SCHEMA_VERSION}). Upgrade the CLI.`,
    )
  } else if (found < SCHEMA_VERSION) {
    migrate(sqlite, found)
    sqlite.pragma(`user_version = ${SCHEMA_VERSION}`)
  }

  const db = drizzle(sqlite, { schema })
  return { db, sqlite, path }
}
