import { index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Phase-1 schema. Deliberately dialect-portable: phase 2 swaps this file for a
 * pg one and nothing above the repository layer changes.
 */

export const events = sqliteTable('events', {
  /** dedup key from the adapter — see docs/adapters.md */
  id: text('id').primaryKey(),
  ts: integer('ts').notNull(),
  provider: text('provider').notNull(),
  kind: text('kind').notNull(),
  sessionId: text('session_id'),
  scopeHash: text('scope_hash').notNull(),
  unitLabel: text('unit_label'),
  /** JSON object of quantities in units of `kind` */
  qtyJson: text('qty_json').notNull(),
  costUsd: real('cost_usd'),
  /** JSON object, numbers only */
  metaJson: text('meta_json').notNull(),
  /** sum of qty values; denormalised so "biggest events" doesn't parse JSON per row */
  qtyTotal: real('qty_total').notNull().default(0),
}, t => [
  index('idx_events_ts').on(t.ts),
  index('idx_events_scope').on(t.scopeHash, t.ts),
  index('idx_events_provider').on(t.provider, t.ts),
  index('idx_events_session').on(t.sessionId, t.ts),
])

export const scopes = sqliteTable('scopes', {
  scopeHash: text('scope_hash').primaryKey(),
  /** human-readable alias — local only, never synced */
  label: text('label').notNull(),
  provider: text('provider').notNull(),
  lastSeen: integer('last_seen').notNull(),
})

export const limits = sqliteTable('limits', {
  ts: integer('ts').notNull(),
  provider: text('provider').notNull(),
  window: text('window').notNull(),
  usedPct: real('used_pct').notNull(),
  resetsAt: integer('resets_at'),
}, t => [
  primaryKey({ columns: [t.provider, t.window, t.ts] }),
  index('idx_limits_lookup').on(t.provider, t.window, t.ts),
])

export const scanState = sqliteTable('scan_state', {
  sourcePath: text('source_path').primaryKey(),
  mtime: integer('mtime').notNull(),
  size: integer('size').notNull(),
  offset: integer('offset').notNull(),
})

export type EventRow = typeof events.$inferSelect
export type ScopeRow = typeof scopes.$inferSelect
export type LimitRow = typeof limits.$inferSelect
export type ScanStateRow = typeof scanState.$inferSelect
