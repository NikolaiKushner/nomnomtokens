# Plan: `nnt audit` — where the tokens went

**Date:** 2026-08-21 · **Branch:** `main` · **Status:** done
**Source:** [docs/research/brainstorm-what-to-improve-2026-08-21.md](../research/brainstorm-what-to-improve-2026-08-21.md) bet #1

## Problem

Claude Code / multi-agent users already see “how much” (ccusage, `/usage`, our Overview), but not the **lever**: what share of spend is subagents, cache reads vs fresh input, which model (Fable/Opus/Sonnet). Evidence: Fable weekly burn in minutes, 84-agent workflow, “saves or burns?”.

## Outcome

A user can open Overview (or `nnt audit`) for a chosen range and get: cache/sidechain/model breakdown, top “wastey” sessions, and 1–3 text tips (“subagents = X% — set CLAUDE_CODE_SUBAGENT_MODEL”).

## Success criteria

- [x] `Queries` can sum cost/tokens with `meta.sidechain = 1` vs the rest for any `Filters` range
- [x] `GET /api/stats/audit` returns: cache share, sidechain share (or `null` if no tagged events), model mix top-N, top sessions by sidechain% or cost, `tips: string[]` (0–3)
- [x] Overview shows a “Where it went” block under existing tiles (no separate Browse page in v1)
- [x] `nnt audit [--days] [--json]` prints the same summary in the terminal
- [x] Unit tests for tip logic and SQL sidechain split; `pnpm -r typecheck` and `pnpm -r test` green
- [x] Cursor/Codex without `sidechain`: UI shows “Subagents: n/a (Claude Code only)” — not 0%

## Non-goals

- No separate Browse page `/audit` in v1 (Overview + CLI is enough)
- No `nnt reconcile` / vendor `/usage` reconciliation (digest bet #3)
- No `nnt verdict` Max 20x (bet #4)
- No cross-agent “Codex still has headroom” in the statusline (bet #2)
- No adapter changes / no `parentSessionId`
- No OTLP, no cloud, no new dependencies

## Context found in the codebase

- **Contract:** `SpendEvent.meta` is numbers-only; Claude writes `meta.sidechain = 1` in [`packages/adapters/src/claude-code/jsonl.ts`](../../packages/adapters/src/claude-code/jsonl.ts); the field is **never aggregated**.
- **Aggregates:** `cacheHitRate`, `costPerKLines` in [`packages/core/src/aggregate.ts`](../../packages/core/src/aggregate.ts); qty already in `TOTALS` SQL via `json_extract` on `qty_json`.
- **UI pattern:** Providers — [`apps/web/server/api/stats/providers.get.ts`](../../apps/web/server/api/stats/providers.get.ts) → `useProviderStats` → `providers.vue`. Overview — [`summary.get.ts`](../../apps/web/server/api/stats/summary.get.ts) → `useSummary` → [`index.vue`](../../apps/web/app/pages/index.vue).
- **Sessions:** `Queries.sessions` already exists; audit needs an extra sidechain split per session or post-filter.
- **CLI template:** [`packages/cli/src/commands/alerts.ts`](../../packages/cli/src/commands/alerts.ts) — openDb + Queries + format.
- **Rules:** conventional commits on `main`; before push run `pnpm -r typecheck` + `pnpm -r test`.

## Design

**Chosen: pure audit in `packages/core` + one SQL split in `Queries` + API + Overview card + CLI.**  
Server gathers totals / byUnitLabel / sidechainTotals / sessions; core computes shares and tips (no I/O). UI and CLI are thin wrappers over one `AuditReport` shape.

**Why over the alternatives:**

| Approach | How | Trade-off | Verdict |
|---|---|---|---|
| A (chosen) | core tips + Queries.sidechainTotals + `/api/stats/audit` + Overview + `nnt audit` | one contract, two surfaces | **ship** |
| B | only extend `summary.get` | Overview bloats; CLI duplicates parsing | rejected: CLI and API would drift |
| C | separate `/audit` page + nav | more chrome, duplicates Providers | rejected for v1; maybe later |

**What would change this decision:** if tip rules need live limit snapshots — then tips live in the db/alerts layer, not core.

**Touches:** data model (no migrations — `meta_json` already exists) · API (`stats/audit.get.ts`) · UI (Overview) · CLI (`commands/audit.ts`) · deps (none new).

**Shape (target contract):**

```ts
interface AuditReport {
  range: { from: number, to: number }
  totals: { costUsd: number, tokens: number, events: number }
  cache: { hitRate: number | null, readTokens: number, freshInTokens: number }
  sidechain: {
    /** false when no events in range have meta.sidechain */
    tagged: boolean
    costUsd: number
    tokens: number
    shareOfCost: number | null  // sidechain / totals, null if !tagged
  }
  models: Array<{ unitLabel: string | null, costUsd: number, share: number }>
  topSessions: Array<{
    sessionId: string
    label: string | null
    costUsd: number
    sidechainShare: number | null
  }>
  tips: string[]  // 0–3, English, actionable
}
```

## Steps

### 1. Spike + `Queries.sidechainTotals` — S · `[x]`

- **Why first:** unknown how often `sidechain` appears in real stores and whether `json_extract` is correct on a missing key
- **Files:** `packages/db/src/queries.ts` (edit: `sidechainTotals`), `packages/db/src/db.test.ts` (edit)
- **Does:** method returns `{ taggedEvents, costUsd, tokens, qty… }` for rows where `json_extract(meta_json,'$.sidechain') = 1`, plus `COUNT` of all events with any sidechain key for `tagged`. Run against real `~/.nomnomtokens` if present, else fixture insert.
- **Verify:** unit test — 3 events (2 parent, 1 sidechain=1) → sidechain cost = that one; parent-only corpus → `taggedEvents === 0`
- **Depends on:** —

### 2. `buildAuditReport` + tips in core — M · `[x]`

- **Why:** pure logic without SQLite; “tips lie” risk caught by tests before UI
- **Files:** `packages/core/src/audit.ts` (new), `packages/core/src/audit.test.ts` (new), `packages/core/src/index.ts` (export)
- **Does:** from raw slices (totals, sidechain row, byUnitLabel rows, session rows with optional sidechain share) builds `AuditReport`. Tip rules (examples):
  - sidechain share ≥ 30% → tip about `CLAUDE_CODE_SUBAGENT_MODEL` / cheaper subagents
  - cache hitRate ≥ 0.85 and cacheRead dominates tokens → tip that cache reads inflate token count vs $
  - top model is fable/opus and share ≥ 50% → tip reserve frontier for hard tasks
  - `!sidechain.tagged` → no sidechain tip; optional tip “rescan Claude history for subagent folders” only if provider includes claude-code and tagged=false and events>0 — **optional, deferred**
- **Verify:** `pnpm --filter @nomnomtokens/core test` — fixture table → expected tips
- **Depends on:** shape from step 1 (`tagged` field)

### 3. API `GET /api/stats/audit` — S · `[x]`

- **Why:** one JSON for UI; CLI talks to db directly; API needed for Overview
- **Files:** `apps/web/server/api/stats/audit.get.ts` (new), `apps/web/app/composables/useStats.ts` (add `useAudit`)
- **Does:** `readFilters(event)` → `q.totals` / `q.byUnitLabel` / `q.sidechainTotals` / sessions (top 5 by cost with sidechain share) → `buildAuditReport(...)`.
- **Verify:** empty db → empty report without throw; fixture db → shares ∈ [0,1]
- **Depends on:** 1, 2

### 4. Overview “Where it went” — M · `[x]`

- **Why:** surface users see without a new command
- **Files:** `apps/web/app/pages/index.vue` (edit), `components/AuditCard.vue` (new)
- **Does:** card under tiles: cache hit + sidechain % (or n/a) + top 3 models as compact bars/list + tips as muted list. Respects URL filters. Empty state: hide card if `events === 0`.
- **Verify:** manual `pnpm dev` — Claude corpus with subagents shows sidechain > 0; filter provider=codex → sidechain n/a
- **Depends on:** 3

### 5. CLI `nnt audit` — S · `[x]`

- **Why:** shareable / scriptable output; mirrors the digest “command”
- **Files:** `packages/cli/src/commands/audit.ts` (new), `packages/cli/src/index.ts` (register)
- **Does:** openDb → Queries + buildAuditReport → human text (like alerts) and `--json`. Inherit global `--db`; period via `--days 7` default.
- **Verify:** `pnpm nnt audit --json` on empty/test db
- **Depends on:** 1, 2 (need not wait for UI)

*(Steps 4 and 5 can run in parallel after 3; 5 can proceed right after 2 with direct db.)*

### 6. README + roadmap tick — S · `[x]`

- **Files:** `README.md` (Commands table + What you get bullet for audit), `docs/plans/nnt-audit.md` checkboxes
- **Does:** document `nnt audit`; add audit to Roadmap Shipped when merged
- **Verify:** eyeball
- **Depends on:** 4 or 5 landed

## Risks

| Risk | Early signal | Cheapest way to resolve it now |
|---|---|---|
| Few `sidechain` events in real stores | spike step 1 on `~/.nomnomtokens` | show n/a and still ship cache+models |
| Tips sound like medical advice / wrong | review copy | tips only at hard thresholds; max 3 |
| Double-counting session sidechain share is expensive | slow audit API | one SQL `GROUP BY session_id` with conditional SUM |
| Overview overloaded | visual noise | AuditCard below the fold |

## Rollback

No migrations. Rollback = revert API/UI/CLI commits; `meta.sidechain` in data is harmless.

## Test plan

- Unit: `audit.test.ts` (tips + shares); `queries` sidechain fixture
- Integration: e2e not required; CLI smoke manually
- CI: `pnpm -r typecheck`, `pnpm -r test` (per CLAUDE.md)
- Deliberately untested: pixel-perfect Overview; live Claude Code hook path

## Rollout

Straight to `main`, conventional commits:

- `feat(db): aggregate sidechain spend for audit`
- `feat(core): buildAuditReport and tips`
- `feat(web): where-it-went card on Overview`
- `feat(cli): nnt audit`
- `docs: document nnt audit`

release-please picks up a minor. After merge — `nnt scan` on your machine and screenshot Overview.

## Open questions

- [x] Separate page vs Overview — **decided: Overview + CLI**
- [ ] Default CLI period: last 7d vs “same as dashboard filters” — default **7 local calendar days**, override `--days`

## Deferred / out of scope

- `/audit` page + CommandPalette entry
- Per-session sidechain timeline highlight on Sessions drill-down
- Cross-provider pacing tip in statusline
- `nnt reconcile`, `nnt verdict`
- Auto-detect Fable weekly pool (needs limit snapshots for model-scoped windows — data may be missing)
