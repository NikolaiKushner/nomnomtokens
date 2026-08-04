# Writing an adapter

An adapter turns one source of consumption into `SpendEvent`s and
`LimitSnapshot`s. The core knows nothing else.

**A new adapter is a new directory under `packages/adapters/src/` and one line
in the registry. Nothing in `core`, `db`, or the UI should need to change.** If
your adapter can't be added that way, the contract is wrong — open an issue
about the contract rather than working around it.

## The interface

```ts
interface Adapter {
  name: string
  detect(): Promise<boolean>
  scan(state: ScanState): AsyncIterable<IngestRecord>
  watch?(emit: (r: IngestRecord) => void): () => void
}
```

- **`detect`** — is there anything to read on this machine? Presence of a
  directory or config file. Cheap; it runs on every command.
- **`scan`** — walk sources from the last known position and yield records.
  Async iterable, so a large history streams instead of materialising.
- **`watch`** — optional. Subscribe to changes; return a teardown function.

## The two record types

```ts
interface SpendEvent {
  id: string
  ts: number                    // unix ms
  provider: string
  kind: string                  // 'tokens' | 'minutes' | 'requests' | ...
  sessionId: string | null
  scopeHash: string
  unitLabel: string | null      // model, SKU, runner type
  qty: Record<string, number>
  costUsd: number | null
  meta: Record<string, number>
}

interface LimitSnapshot {
  ts: number
  provider: string
  window: string                // '5h' | '7d' | 'month' | ...
  usedPct: number
  resetsAt: number | null
}
```

## Rules

### 1. No content, ever

No prompts, no code, no paths, no tool names. If a field couldn't be shown to a
client's security officer, it doesn't belong in the type. `meta` is numbers
only — that is what guarantees no text escapes through an adapter.

Hash project paths with `scopeHash()` from core. Pass the readable label as a
separate `{ type: 'scope' }` record; it stays local.

### 2. Pick a dedup key that survives a re-read

`id` is a primary key and ingest always upserts. Choose the **source's own
identity for the unit of work** — a request id, an invoice line id, a hash of a
CSV row. Never a per-record id like a log line's uuid.

Get this wrong in the lenient direction and every re-scan inflates the numbers.
The `claude-code` adapter learned this the expensive way: see
[architecture.md](./architecture.md#1-the-same-turn-is-written-several-times).

Prefix with your provider name so two adapters can never collide:

```ts
id: `${provider}:${requestId}:${messageId}`
```

### 3. Be tolerant

Source formats are not public contracts and they change without notice.

- An unknown field is **not** an exception.
- A malformed line is skipped, not thrown — you will hit torn writes at the tail
  of a live file.
- A missing optional field means "absent", not "zero", where the difference is
  meaningful (an unknown cost is `null`; a genuinely free operation is `0`).

### 4. `kind` is a unit, and units don't add up

Tokens don't sum with CI minutes. The UI always pins a single `kind` before
summing, and cost is the only axis on which everything compares with
everything. Pick a `kind` that names the unit, and put the fine-grained
breakdown in `qty`.

### 5. Scanning must be incremental and idempotent

Use the `ScanState` you're handed:

```ts
const cursor = state.get(path)
if (cursor && cursor.size === info.size && cursor.mtime === info.mtimeMs) continue
const start = cursor && info.size >= cursor.size ? cursor.offset : 0
// ...read from start...
state.set({ sourcePath: path, mtime: info.mtimeMs, size: info.size, offset })
```

Advance the offset only past **complete** records. A file shrinking means
rotation — start over and let upsert absorb the repeats.

### 6. Read bytes carefully

If you read a file in chunks, decode with `StringDecoder`, not
`chunk.toString('utf8')`. A multi-byte character split across a chunk boundary
otherwise becomes `U+FFFD` and silently destroys that record.

## Worked example

```ts
import type { Adapter, IngestRecord, ScanState } from '@nomnomtokens/core'
import { costOf, scopeHash } from '@nomnomtokens/core'

export class MyToolAdapter implements Adapter {
  readonly name = 'my-tool'

  async detect(): Promise<boolean> {
    return existsSync(join(homedir(), '.my-tool'))
  }

  async *scan(state: ScanState): AsyncIterable<IngestRecord> {
    for (const path of await findLogs()) {
      const cursor = state.get(path)
      // ...skip unchanged, resume from cursor.offset...

      for await (const record of readRecords(path, cursor?.offset ?? 0)) {
        const hash = await scopeHash(record.projectPath)

        yield { type: 'scope', scopeHash: hash, label: basename(record.projectPath), provider: this.name }

        const qty = { in: record.inputTokens, out: record.outputTokens }
        yield {
          type: 'event',
          event: {
            id: `${this.name}:${record.requestId}`,
            ts: Date.parse(record.timestamp),
            provider: this.name,
            kind: 'tokens',
            sessionId: record.conversationId ?? null,
            scopeHash: hash,
            unitLabel: record.model,
            qty,
            costUsd: costOf(record.model, qty),
            meta: { retries: record.retryCount },
          },
        }
      }

      state.set({ sourcePath: path, mtime, size, offset })
    }
  }
}
```

Register it:

```ts
// packages/adapters/src/index.ts
export function allAdapters(): Adapter[] {
  return [new ClaudeCodeAdapter(), new MyToolAdapter()]
}
```

## Testing

Cover these four, because they are where adapters actually break:

1. **A representative record parses** into the quantities you expect.
2. **Duplicates collapse** — feed the same logical record twice with different
   per-record ids and assert one event with one id.
3. **Incremental scan resumes** — scan, append, scan again, assert only the new
   record comes back; and assert an unchanged file yields nothing at all.
4. **Nothing leaks** — `JSON.stringify(event)` must not contain a path, and
   every value in `meta` must be a number.

See `packages/adapters/src/claude-code/*.test.ts` for all four.

## Non-AI sources

The contract is deliberately not AI-shaped. A CI adapter emits
`kind: 'minutes'` with `qty: { minutes: 12.4 }`; a cloud bill emits
`kind: 'currency'`. The UI already handles mixing: it sums only within a
`kind`, and compares across sources on cost. "Not only AI" is a property of the
types, not a roadmap item.
