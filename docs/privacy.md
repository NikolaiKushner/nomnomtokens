# Privacy

## The short version

nomnomtokens reads your agent's local logs, writes numbers to a SQLite file in
your home directory, and serves a dashboard on localhost. By default it makes
no outbound network requests. There is no account, no telemetry, no crash
reporting, no analytics, and no CDN — the fonts, styles and scripts are all
served by the local process. The only network is opt-in and listed below.

Uninstalling is `rm -rf ~/.nomnomtokens`.

## What is stored

Every record is one of two shapes, and both are enforced by the type system:

```ts
interface SpendEvent {
  id: string          // requestId + message id — an identifier, not content
  ts: number
  provider: string    // 'claude-code'
  kind: string        // 'tokens'
  sessionId: string | null
  scopeHash: string   // sha256(project path).slice(0, 16)
  unitLabel: string | null  // model id, e.g. 'claude-opus-5'
  qty: Record<string, number>
  costUsd: number | null
  meta: Record<string, number>   // numbers only
}
```

Two rules make this safe by construction rather than by discipline:

1. **No free-form string field carries content.** There is nowhere to put a
   prompt, a file, a diff, or a path. If a field could not be shown to a
   client's security officer, it does not exist in the type.
2. **`meta` holds numbers only.** This is the guarantee that no text can leak
   through an adapter, however sloppily that adapter is written.

## What is *not* stored

Not stored anywhere, at any point, including in memory beyond parsing:

- prompts, responses, or thinking content
- file contents or diffs (only the **count** of changed lines)
- file paths or project paths (only a truncated hash)
- tool names, tool inputs, tool outputs
- git branches, repository names, URLs
- environment variables, API keys, tokens
- your name, email, or machine identifiers

## Project paths

A "scope" is whatever the provider considers a project. Events store
`sha256(path).slice(0, 16)` — never the path.

The human-readable label you see in the UI (`nomnomtokens`, `client-x`) lives in
a separate local `scopes` table, is derived from the last path segment, and is
never attached to an event. An optional `client` tag on that same row is also
local-only — it is for invoices, not for the event contract. In phase 2, when
events sync to a server, the label table stays on your machine: the cloud sees
`80d4d49179768aed`, not `/Users/you/dev/acme-secret-project`.

The hash is one-way but not unguessable — an attacker who already knows a
candidate path can confirm it. It defends against disclosure, not against
targeted confirmation. Paths are simply never transmitted, which is the actual
protection.

## What the statusline hook sees

`nnt statusline` receives Claude Code's session JSON on stdin. That payload
contains more than we keep — it can include the transcript path, git branch,
PR number and worktree details. We extract exactly:

- `rate_limits.five_hour` / `.seven_day` → used percentage and reset time
- `cost.total_cost_usd`, `total_lines_added`, `total_lines_removed`,
  `total_duration_ms`, `total_api_duration_ms`
- `context_window.used_percentage`
- `model.id`, `session_id`, and the project directory (hashed immediately)

Everything else in the payload is read and discarded. It is never written.

## What the Cursor adapter reads

The Cursor adapter opens Cursor's local `state.vscdb` (and maps workspaces via
`workspaceStorage/*/workspace.json`) in **read-only** mode. From each bubble it
keeps only:

- bubble / composer ids (dedup keys)
- timestamps
- `tokenCount.inputTokens` / `outputTokens` when non-zero
- `contextWindowStatusAtCreation.tokensUsed` when exact counts are absent
- model id from `composerData.modelConfig`
- line-change totals as numbers

Bubble text, diffs, file paths, tool payloads, and anything else in the row are
never written to nomnomtokens storage. Many Cursor sessions store zero token
counts locally — those bubbles are skipped rather than estimated from message
text.

## What the Codex adapter reads

The Codex adapter tails `~/.codex/sessions/**/rollout-*.jsonl` (override root
with `CODEX_HOME`). From each line it keeps only:

- session id and a hashed project cwd (last path segment as the UI label)
- model id from `turn_context`
- per-turn `last_token_usage` counts (`input` / `cached` / `cache_write` / `output`)
- rate-limit `used_percent` / `resets_at` windows when present

Message content, tool inputs/outputs, diffs, git metadata, and auth files under
`~/.codex` are never opened for ingest.

## Files on disk

| Path | Contents |
|---|---|
| `~/.nomnomtokens/data.db` | events, scope labels, limit history, scan cursors |
| `~/.claude/settings.json` | modified by `nnt init` to add `statusLine` — backed up to `.nnt-backup` first |
| Cursor `state.vscdb` | **read only** by the Cursor adapter; never modified |
| `~/.codex/sessions/**/*.jsonl` | **read only** by the Codex adapter; never modified |

`nnt init` refuses to overwrite an existing status line unless you pass
`--force`, and refuses to touch the file at all if it is not valid JSON.

## Network

Phase 1 makes no outbound requests unless you opt in. The dashboard binds to
localhost. Scan and serve never open a socket to the internet.

Three opt-in channels, all off by default:

1. **Price-table refresh.** `nnt prices refresh` writes the bundled rates to
   `~/.nomnomtokens/prices.json` with no network. `nnt prices refresh --from
   <https://…>` is a GET of that URL only (no account, no telemetry, no path
   or prompt data).
2. **Alert webhooks.** `alerts.json` `webhook` or `nnt alerts check --webhook`.
   The POST body contains only threshold hits (percentages and dollar amounts)
   — never prompts, paths, or diffs.
3. **OTLP export.** `nnt otel --endpoint <url>` POSTs OTLP/HTTP JSON metrics
   (`nnt.cost_usd`, `nnt.tokens`) with attributes `provider`, `unit_label`,
   `scope_hash`. Project labels are omitted unless you pass `--include-labels`.
   Scan and serve never call this; there is no hook, no config auto-export.

## nnt archives

`nnt export --format nnt` writes events, limit snapshots, and the local
`scopes` table (labels and client tags) to a JSON file. `scan_state` is not
included — paths on another machine are different. The file is the whole local
history you already have in SQLite, including those labels. Treat it like the
database: do not post it, do not commit it. Re-import uses the same upsert as
ingest, so duplicates do not double-count.

## Phase 2, when it arrives

Cloud mode is opt-in and additive: local SQLite stays the primary sink and the
network is never in the critical path.

The property that makes it defensible is a phase-1 decision, not a phase-2
promise: **only numbers and hashes exist in the contract**, so only numbers and
hashes can be transmitted. There is no code path that could send a prompt,
because no prompt is ever stored.
