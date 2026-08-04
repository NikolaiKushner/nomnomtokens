import { defaultDbPath, openDb, Queries, Repo } from '@nomnomtokens/db'
import type BetterSqlite3 from 'better-sqlite3'

/**
 * One SQLite connection for the whole server process.
 *
 * WAL mode (set in openDb) is what makes this safe: `nnt scan` can be writing
 * from another process while these read queries run, without either blocking
 * the other.
 */

let handle: { sqlite: BetterSqlite3.Database, queries: Queries, repo: Repo, path: string } | null = null

export function store() {
  if (!handle) {
    const path = process.env.NOMNOMTOKENS_DB ?? defaultDbPath()
    const { sqlite } = openDb(path)
    handle = { sqlite, queries: new Queries(sqlite), repo: new Repo(sqlite), path }
  }
  return handle
}

export function queries(): Queries {
  return store().queries
}

export function repo(): Repo {
  return store().repo
}
