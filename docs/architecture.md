# Architecture

```
adapters ──→ ingest (dedup) ──→ SQLite ──→ Nitro API ──→ Nuxt UI
    │                              ▲                        ▲
    └── watcher ───────────────────┘         SSE ───────────┘
```

Everything runs on the user's machine. There is no network hop in the data
path. Opt-in outbound calls (`nnt otel`, price `--from`, alert webhooks) sit
beside that path; they never run from `scan` or `serve` unless you pass a flag.

## Packages

| Package | Contains | Depends on |
|---|---|---|
| `packages/core` | `SpendEvent` / `LimitSnapshot` types, pricing, aggregation, forecasting, audit, verdict, OTLP mapping, nnt archive, scope hashing | nothing — isomorphic, no Node API |
| `packages/db` | Drizzle schema, connection, upsert repository, read queries | core, better-sqlite3 |
| `packages/adapters` | `claude-code` (jsonl + statusline), `cursor` (state.vscdb), `codex` (rollout jsonl), `csv` | core |
| `packages/cli` | `init`, `scan`, `serve`, `statusline`, `doctor`, `audit`, `verdict`, `export`/`import`, `otel` | all of the above |
| `apps/web` | Nuxt 4 UI + Nitro API + SSE | all of the above |

The dependency direction is strictly one way. `core` knows nothing about Claude
Code, SQLite, or Vue; an adapter knows nothing about storage; the UI knows only
the API. That is what makes the phase-2 cloud a second sink rather than a
rewrite.

## Which number to trust

There are three sources for "how much did this cost", and they disagree:

| Source | Covers | Trust it for |
|---|---|---|
| JSONL transcripts | complete history, per turn | volumes, history, per-project attribution |
| statusline `cost.total_cost_usd` | current session only | reconciling our arithmetic against Claude Code's |
| our price table | anything with a known model id | cost, everywhere |

Modern Claude Code transcripts contain **no `costUSD` field** — it was present
in older versions and is gone. Every cost figure in nomnomtokens is therefore
computed locally from `message.model` plus the token counts, using
`packages/core/src/pricing.ts`. When a model id has no published price the cost
is `null`, never `0`: the UI shows how many events were excluded rather than
silently under-reporting. `<synthetic>` is the exception — it marks a
client-generated message with no API call behind it, so it is priced at exactly
zero.

## The three things that make the numbers correct

These were each found by reconciling against the raw transcripts, and each has a
regression test.

### 1. The same turn is written several times

Claude Code re-writes assistant records within a single transcript file. On the
corpus this was built against, **3,269 of 4,806 distinct turns appeared 2–3
times**, byte-identical apart from the `uuid` field. Summing naively
over-reports by roughly **2.3×**.

The deduplication key is therefore `requestId` + `message.id` — the API-level
identity of the turn — and never `uuid`, which is per-record.

Some repeats are not identical: an early write can be a streaming partial with
lower counts than the final record. So the upsert carries a guard:

```sql
ON CONFLICT(id) DO UPDATE SET ... WHERE excluded.qty_total >= events.qty_total
```

A fuller record replaces a partial; a partial can never clobber a full one.

### 2. Subagent spend is three directories deeper

Top-level sessions live at `projects/<project>/<session>.jsonl`. **Task-tool
subagents do not** — they are written to
`projects/<project>/<session>/subagents/agent-*.jsonl`.

Anything that globs `projects/*/*.jsonl` silently omits every subagent turn.
That was 836 records across 13 files here, and subagent work is not cheap. The
walker recurses to any depth for exactly this reason.

### 3. Chunk boundaries corrupt multi-byte characters

Transcripts contain plenty of non-ASCII. Reading a file in chunks and calling
`chunk.toString('utf8')` on each independently mangles any character that
straddles a boundary into `U+FFFD`, which breaks that line's JSON and drops the
record with no error. The reader uses a `StringDecoder`, which carries the
partial sequence across chunks.

### Verification

The scan is reconciled against an independent implementation over the same raw
files — matching on row count and on all five token buckets exactly:

```
python rows/tokens: 4860 [333360, 4171657, 1209937, 37821046, 1295917997]
db     rows/tokens: 4860 [333360, 4171657, 1209937, 37821046, 1295917997]
```

## Incremental scanning

`scan_state` stores `(mtime, size, offset)` per source file.

- Same `mtime` **and** `size` as last time → the file is not opened at all.
- Grew → read from `offset` only.
- Shrank → rotated or rewritten, so re-read from the top and let upsert absorb
  the repeats.

Offsets advance only to the last complete line, so a file being written to right
now resumes at the torn record rather than losing or duplicating it.

The result: a first scan of a year of transcripts takes ~500 ms, and a re-scan
takes ~13 ms and changes nothing.

## Storage

SQLite in WAL mode, which is what lets `nnt scan` write while `nnt serve` reads
without either blocking the other.

Aggregation happens in SQL, not JavaScript. `qty` and `meta` are JSON columns
because the event contract is provider-agnostic, and `json_extract` handles the
row counts involved comfortably. `qty_total` is denormalised onto the row so the
dedup guard and "biggest events" never parse JSON.

Writes go through prepared statements inside chunked transactions (5,000
records), so a large scan neither holds one enormous transaction open nor pays
query-builder overhead per row.

## Real time

Two paths feed the dashboard while you work:

1. **In-process watcher** (`server/plugins/watch.ts`) — chokidar tails the
   transcript directory, so `nnt serve` alone is enough.
2. **External writers** — `nnt scan --watch`, or the statusline hook writing
   directly. A 1 s poll of `MAX(ts)` notices those.

Both mark the store dirty. A single 1 s interval then aggregates **once** and
fans the frame out to every SSE subscriber, so ten open tabs cost one
aggregation per second rather than ten.

Two h3 details the SSE endpoint depends on, both of which cost real debugging
time:

- Frames must be pushed as structured messages (`{event, data}`). h3 does its
  own SSE framing, so a hand-built `"event: …\ndata: …"` string gets wrapped
  twice and arrives as garbage.
- **Nothing may be awaited before `stream.send()` is returned.** The response
  has not started yet, so awaiting a push there deadlocks the request — the
  client never even receives headers. The opening snapshot is scheduled with
  `setTimeout(…, 0)` instead.

## Prices go stale

Model prices change, and a bundled table is wrong the moment it ships.
`packages/core/src/pricing.ts` is the fallback, not the authority: it resolves
ids tolerantly (strips date snapshots, `-fast` suffixes, provider prefixes, and
falls back to longest-prefix family match) so a model released after this build
still prices at its family rate rather than vanishing.

Cache multipliers are derived rather than stored per model: 1.25× input for a
5-minute cache write, 2× for a 1-hour write, 0.1× for a read. The transcript's
`cache_creation` object splits writes by TTL, so the two are priced separately
rather than lumped together.
