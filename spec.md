# nomnomtokens — Specification v2

> nom nom nom — your agent is eating tokens. The dashboard shows exactly how many.

A local-first web dashboard for spend analytics. Starts with Claude Code; the architecture is designed from day one for **any tool with measurable consumption** — other AI agents, and ultimately non-AI sources too (CI minutes, cloud bills). Phase 2 adds cloud mode, authentication, teams and an admin panel.

Name is locked: package `nomnomtokens`, short command alias `nnt`.

---

## 0. Claiming the Name — Today's Checklist

Order matters: free and instant first, everything else after.

1. **npm** — the `claim-nomnomtokens.sh` script next to this file: creates a working placeholder v0.0.1 (ASCII art + a description of what's coming), runs `publish --dry-run`, and publishes with the `--publish` flag. Before running: `npm login`, replace `CHANGEME` with your handle. Two npm-policy nuances: the package must *do something* (bare squatting can be removed via a dispute), and the name should turn into a real release within roughly half a year.
2. **GitHub** — create the `nomnomtokens` repository (an empty one with the placeholder README is fine). No need for a separate organisation while it's a single project.
3. **PyPI** — optional but cheap: `nomnomtokens` is free there, and a minimal placeholder locks the name in the Python ecosystem (useful if a Python SDK for the OTel agent ever appears).
4. **Domain** — check `nomnomtokens.dev` / `.sh` via namecheck.sh (RDAP is unreachable from my environment). Not critical for launch; a landing page can live on GitHub Pages.
5. **X / social handles** — takes a minute to check by hand; for a dev tool it's nice-to-have rather than required.

After steps 1–2 the name can be considered secured: an npm package plus a repository is what people actually search for.

---

## 1. Positioning

**In one line:** `npx nomnomtokens` — and a dashboard opens in your browser: how much your agent has eaten today, on which projects, and when you'll hit the limit.

**Brand tone:** self-irony instead of stern monitoring. A glutton mascot, a headline reading "Eaten today: $4.20", an empty state saying "the model hasn't been fed yet". This isn't decoration — it's differentiation: the CLI-tables market is taken (ccusage), the status-line market is taken (claude-pulse, ccstatusline) — what's free is the niche of *visual and characterful*.

**Who it's for:**
- a developer on Pro/Max who has no idea where the weekly limit goes;
- a freelancer who needs to attribute agent spend to specific clients (per-project is the killer feature for exactly this person);
- a team lead (phase 2) justifying an AI tooling budget.

---

## 2. The Core Architectural Decision: Adapters

The core knows nothing about Claude Code. It knows two record types — a **spend event** and a **limit snapshot** — and any source plugs in via an adapter that translates its format into those two types.

```
┌─ adapters ────────────────────────┐
│ claude-code   (jsonl + statusline)│──┐
│ codex         (todo)              │  │      ┌─────────┐    ┌────────┐    ┌─────────┐
│ cursor        (todo)              │  ├──→   │ ingest  │──→ │ SQLite │──→ │ Nuxt UI │
│ otel-generic  (any OTLP)          │  │      │ (dedup) │    └────────┘    └─────────┘
│ csv-import    (anything tabular)  │──┘      └─────────┘
└───────────────────────────────────┘
```

### 2.1 Event Contract

```ts
// packages/core/src/types.ts

/** A unit of spend. Not tied to AI: `kind` says what exactly was consumed. */
export interface SpendEvent {
  /** stable deduplication key: requestId, hash of a CSV row, etc. */
  id: string
  ts: number                 // unix ms
  /** which adapter produced the event: 'claude-code' | 'codex' | 'csv' | ... */
  provider: string
  /** what we're measuring: 'tokens' | 'requests' | 'minutes' | 'currency' | ... */
  kind: string
  sessionId: string | null
  /** sha256(project path/name).slice(0,16); the human-readable alias lives only in the local DB */
  scopeHash: string
  /** free-form detail: model, runner type, SKU — whatever is meaningful for the provider */
  unitLabel: string | null
  /** quantities in units of `kind`; for tokens — unpacked by type */
  qty: Record<string, number>      // { in, out, cacheCreate, cacheRead } | { minutes } | ...
  costUsd: number | null
  meta: Record<string, number>     // linesAdded, linesRemoved, ... — numbers, never strings
}

/** A constraint snapshot (subscription limits, CI quotas, etc.) */
export interface LimitSnapshot {
  ts: number
  provider: string
  window: string                   // '5h' | '7d' | 'month' | ...
  usedPct: number
  resetsAt: number | null
}

/** The adapter interface */
export interface Adapter {
  name: string
  /** is there anything to read on this machine (detection by presence of dirs/config) */
  detect(): Promise<boolean>
  /** passive collection: walk the sources from the last known position */
  scan(state: ScanState): AsyncIterable<SpendEvent | LimitSnapshot>
  /** active collection: subscribe to changes (watcher, http receiver) */
  watch?(emit: (e: SpendEvent | LimitSnapshot) => void): () => void
}
```

Two hard rules of the contract:
- **no free-form string fields with content.** No prompt text, no code, no paths. If a field couldn't be shown to a client's security officer, it doesn't exist in the type;
- **`meta` holds numbers only.** That's the guarantee no text can leak through an adapter.

### 2.2 Adapters by Phase

| Adapter | Phase | Source | Notes |
|---|---|---|---|
| `claude-code` | 1 (MVP) | `~/.claude/projects/**/*.jsonl` + statusline hook | reference adapter: full history + live limits |
| `otel-generic` | 1.5 | OTLP receiver on `/v1/metrics` | instantly covers anything that can export OTel — including Claude Code without our script |
| `csv-import` | 1.5 | file upload in the UI | the cheap universal entry path: OpenAI/Anthropic billing exports, anything tabular. Also a great demo mode |
| `codex` | 2 | its local logs | study the format when we get there |
| `cursor` | 2 | its local data | same |
| `github-actions` | idea | CI minutes billing API | proof that "not only AI" is a property, not a slogan |

The rule for additions: **a new adapter = a new file in `packages/adapters/`, zero changes to the core or the UI.** If adding a source requires touching the core, the contract was designed wrong — fix the contract.

The UI must survive mixing: a provider selector, sums only within a single `kind` (tokens don't add up with minutes), and cost as the one cross-cutting axis on which everything can be compared with everything.

---

## 3. Phase 1 — Local-First MVP

Everything on the user's machine. No account, no network, no hosting.

```
adapters ──→ Nitro :port ──→ SQLite (~/.nomnomtokens/data.db) ──→ Nuxt UI (localhost)
                 │
                 └─ SSE ──→ live updates in the browser
```

### 3.1 Repository Structure

pnpm workspaces, TypeScript throughout.

```
nomnomtokens/
├── packages/
│   ├── core/          # types, aggregation, forecasting, price tables — isomorphic, zero Node API
│   ├── adapters/
│   │   ├── claude-code/
│   │   │   ├── jsonl.ts        # log-line parser
│   │   │   ├── statusline.ts   # hook stdin-payload parser
│   │   │   └── index.ts        # Adapter implementation
│   │   └── csv/
│   ├── db/            # Drizzle: schema/sqlite.ts (ph.1), schema/pg.ts (ph.2)
│   └── cli/           # commander: init | scan | serve | statusline | doctor
├── apps/
│   └── web/           # Nuxt 4: UI + Nitro API (ingest, stats, SSE, OTLP receiver)
├── docs/
│   ├── architecture.md
│   ├── adapters.md    # how to write your own adapter — an open invitation to contributors
│   └── privacy.md     # what is collected and what is never collected
└── scripts/namecheck.sh
```

### 3.2 Database Schema (phase 1)

```sql
events(
  id TEXT PRIMARY KEY, ts INTEGER NOT NULL,
  provider TEXT, kind TEXT, session_id TEXT,
  scope_hash TEXT, unit_label TEXT,
  qty_json TEXT,          -- JSON with quantities
  cost_usd REAL, meta_json TEXT,
  UNIQUE(id)
);
CREATE INDEX idx_events_ts ON events(ts);
CREATE INDEX idx_events_scope ON events(scope_hash, ts);

scopes(scope_hash TEXT PRIMARY KEY, label TEXT, provider TEXT, last_seen INTEGER);
limits(ts INTEGER, provider TEXT, window TEXT, used_pct REAL, resets_at INTEGER);
scan_state(source_path TEXT PRIMARY KEY, mtime INTEGER, size INTEGER, offset INTEGER);
```

Always `INSERT ... ON CONFLICT(id) DO UPDATE`. JSONL gets re-read, the agent restarts, the network returns a 200 after a timeout — without upsert the numbers drift within the first week.

### 3.3 Screens

1. **Overview** — "Eaten today / this week / this month" (cost, volume, sessions), sparklines, a limits widget with a forecast — "at the current rate you'll hit the cap on Thursday". The mascot's expression changes as the limit fills — from content to overstuffed.
2. **Timeline** — hour×weekday heatmap (GitHub-contributions style), stacked chart by `unitLabel` (models), cost/volume/sessions toggle.
3. **Scopes (projects)** — a table with trends; clicking filters the whole dashboard. For a freelancer this is the "how much did the agent cost on client X's project" report.
4. **Providers** — distribution across sources; for Claude Code — cache hit rate (`cacheRead / (cacheRead + in)`) and cost per 1,000 changed lines.
5. **Sessions** — a list with drill-down into a single session's timeline.
6. **Limits** — window-fill history, linear regression on burn rate, markers for the moments you actually hit the cap.

Details that separate a dev tool from yet another CRUD app: filter state in the URL, `⌘K` navigation, full keyboard operation, dark theme by default, meaningful empty states.

### 3.3a UI Stack and Components

Nuxt 4 / Vue 3 / TypeScript, Tailwind CSS v4, and **our own component library**.

**No component-library dependency.** No shadcn-vue, no reka-ui, no headless
primitive package. `app/components/ui/` contains plain Vue components we own
outright.

What we *do* take from shadcn is the **design language**, reproduced exactly:

- **Tokens verbatim.** The `oklch` values in `app/assets/css/main.css` are
  copied from `shadcn-ui/ui` (`apps/v4/app/globals.css`), along with the
  `@theme inline` mapping and the `--radius` scale. Surfaces, borders, rings and
  radii are pixel-identical to shadcn's.
- **The variant API.** `class-variance-authority` + `clsx` + `tailwind-merge`,
  with shadcn's exact recipe strings for `Button`, `Badge`, `Card`, `Table`,
  `Input`, `Progress`, `Separator`, `Skeleton`, `Tabs`. Every component takes a
  `class` prop merged through `cn()`, so later utilities win.

One deliberate divergence: shadcn's docs theme sets every `--chart-*` to a shade
of blue — a sequential ramp. Ours encodes *categories* (models, providers), so
it uses the multi-hue categorical palette from shadcn's default registry theme,
extended to eight. A monochrome ramp would imply an ordering between "opus" and
"haiku" that doesn't exist.

Behaviour we implement ourselves rather than import:

| Component | Approach |
|---|---|
| `Tabs` | WAI-ARIA tab pattern; arrows, Home/End |
| `Select` | native `<select>` in shadcn's trigger styling — type-ahead and screen-reader semantics for free, zero JS |
| `Tooltip` | CSS positioning; every tooltip here sits on a small control |
| `CommandPalette` | native `<dialog>` — focus trap, Escape, inert background, top layer, all from the platform; subsequence matching over pages, ranges and projects |

Two Tailwind v4 traps worth recording, because both fail silently:

- **Class names must appear literally in source.** A class assembled at runtime
  (`'bg-chart-1/' + step`, or `.replace('fill-','bg-')`) is never seen by the
  compiler, and the element renders with no styling at all. The heatmap's
  five-step scale is written out in full for this reason.
- Custom tokens need both a `:root` variable *and* an `@theme inline` entry, or
  the utility exists but resolves to nothing.

### 3.3b Charts — Unovis

Chart library: **[Unovis](https://unovis.dev)** (`@unovis/vue` + `@unovis/ts`),
used for the XY charts; sparklines and the heatmap are hand-rolled SVG.

Why Unovis over the alternatives:

| Candidate | Verdict |
|---|---|
| **Unovis** | **chosen** — styles from CSS custom properties, so it inherits our shadcn tokens and switches theme with no re-render; composable (container and marks are separate components) rather than a config-object wrapper; TypeScript-first; ~350 kB Vue package |
| ECharts / vue-echarts | most capable, but configured through JS objects — theming is a parallel config that has to be kept in sync with our tokens, and theme switching re-renders |
| Chart.js / vue-chartjs | canvas, so no CSS-variable styling and no DOM to inspect or style; weaker for dense time series |
| D3 directly | maximum control, most code; we use its *scales* implicitly through Unovis and hand-roll only the trivial marks |

The CSS-variable point is the decisive one: because the theme is tokens rather
than a config object, "dark by default with an instant toggle" costs nothing,
and the charts cannot drift from the rest of the UI.

What is hand-rolled, and why it isn't worth a library:

- **Sparkline** — a `<path>` with no axes, legend or interaction. Renders on the
  server, so it is present in the first paint next to the headline number
  instead of popping in.
- **Heatmap** — a fixed 7×24 grid of `<rect>`s with a five-step quantised scale.
  Quantised rather than continuous because you can count five levels at a glance
  and you cannot count sixty; `sqrt` rather than linear because spend is heavily
  skewed and a linear ramp renders every hour except the peak as the same square.

### 3.4 Real Time

The statusline hook (throttled to ~300 ms) and the chokidar watcher push events into ingest; the server aggregates and pushes to the browser over SSE no more than once a second; charts append points instead of re-rendering. The client remembers the last `ts` and fetches the delta on reconnect.

### 3.5 MVP Scope

In: the complete claude-code adapter, SQLite + dedup, `nnt init` (writes the statusline entry into `~/.claude/settings.json`), Overview/Timeline/Scopes screens, limits with forecast, SSE, npx packaging, README + privacy.md + a GIF of the live dashboard.

Out (→ the README Roadmap): every adapter except claude-code and csv, cloud mode, export, alerts, localisation.

### 3.6 Milestones

| # | What | Evenings | Done when | Status |
|---|---|---|---|---|
| M0 | **Number reconciliation**: JSONL vs `/stats` vs statusline on your own data | 1 | you know which source to trust | ✅ done |
| M1 | Monorepo skeleton, type contract, JSONL parser | 2 | `nnt scan` prints a correct total for today | ✅ done |
| M2 | SQLite, incremental scan, dedup | 2 | a re-run doesn't change the numbers, <1 s | ✅ done — re-scan is 13 ms |
| M3 | Nuxt: Overview + Timeline on real data | 3–4 | the dashboard opens and doesn't lie | ✅ done |
| M4 | statusline integration, limits, SSE, forecast | 2–3 | numbers move in real time | ✅ done |
| M5 | Scopes, Providers, mascot, polish | 2–3 | portfolio-worthy | ✅ screens done; polish ongoing |
| M6 | npx packaging, README, GIF, replacing the placeholder with v0.1.0 | 2 | `npx nomnomtokens` works on a clean machine | ✅ verified from a packed tarball; GIF + `npm publish` outstanding |

**M6 notes.** The workspace packages are `private: true` and will never exist on
npm, so the CLI is bundled with all `@nomnomtokens/*` code inlined (tsup,
`noExternal`); only `better-sqlite3`, `chokidar` and `commander` stay external
and are declared as real dependencies. The Nuxt build is staged from
`apps/web/.output` to `web/` at pack time, because a dot-directory inside
another workspace package does not survive `npm pack`.

Acceptance was checked the only way that counts: `npm pack`, install the
tarball into a throwaway project, and run it — on a machine with agent history
(scan → serve → all six screens → SSE) and on one with none (warns, still opens
the dashboard, shows the empty state, exits 0). That test caught a real bug:
`nnt --port 5000` errored because the implicit-serve path only fired on a
completely bare invocation, so any flag forced the user to type `serve`.

M0 came first for a reason, and it paid for itself several times over. The
public claim that JSONL *under*-reports turned out to be the wrong worry — the
real failure mode is **over**-reporting, and there were three separate ways to
get the number wrong. Full detail in `docs/architecture.md`; the findings:

1. **Duplicate turns (~2.3× over-report).** Claude Code re-writes assistant
   records within a single file — 3,269 of 4,806 distinct turns appeared 2–3
   times, byte-identical apart from `uuid`. Dedup must key on
   `requestId` + `message.id`, never `uuid`. Some repeats are streaming
   partials with *lower* counts, so the upsert needs a
   `WHERE excluded.qty_total >= events.qty_total` guard or a partial clobbers
   the final figure.

2. **Subagent spend is invisible to the obvious glob.** Task-tool subagents
   write to `projects/<project>/<session>/subagents/agent-*.jsonl` — three
   levels below top-level sessions. Anything globbing `projects/*/*.jsonl`
   silently drops all of it (836 records here). The walker must recurse.

3. **`costUSD` no longer exists.** Modern transcripts carry no cost field at
   all, so every cost figure must be computed locally from `message.model` +
   `usage`. That makes the price table load-bearing, which is why it resolves
   ids tolerantly and why unknown models yield `null` rather than `0`.

Verified by reconciling the scanner against an independent implementation over
the same raw files — exact match on row count and all five token buckets
(4,860 rows; 333,360 / 4,171,657 / 1,209,937 / 37,821,046 / 1,295,917,997).

**Which source to trust, settled:** JSONL for history, volumes and per-project
attribution; our price table for all cost; statusline for the two things the
transcript does not contain at all — subscription limits (`rate_limits.five_hour`
/ `.seven_day`) and authoritative per-session line counts.

### 3.7 Risks

| Risk | Mitigation |
|---|---|
| JSONL numbers are wrong | M0 before any UI — confirmed real (three distinct over-report modes), each now covered by a regression test |
| Source formats change | tolerant parsers (an unknown field ≠ an exception), fixtures in tests, schema version in the DB |
| Model price tables go stale | prices as a separate JSON: fetched when online, bundled as a fallback. Unknown ids resolve to their family by longest prefix; genuinely unknown yields `null`, and the UI says how many events were excluded rather than under-reporting |
| Native `better-sqlite3` blocks `npx` on some machines | prebuilt binaries cover mainstream platforms; if it bites, `node:sqlite` (built in from Node 22.5) is a drop-in escape hatch behind the same repository layer |
| "Not only AI" dilutes focus | in phase 1 — only the contract and claude-code; universality lives in the types, not in the roadmap |
| Never shipping | a hard MVP; every "we could also…" becomes a Roadmap line, not code |

---

## 4. Phase 2 — Cloud, Teams, Admin Panel

Starts only after phase 1 ships and real feedback arrives. What follows is the target picture, so that phase-1 decisions don't contradict it.

### 4.1 Principle

**The cloud is not a rewrite — it's a second sink for the same events.** The `SpendEvent` contract is frozen in phase 1; cloud mode adds a transport and multi-tenancy without touching the core or the adapters.

```
local agent (nnt sync --daemon)
   │  SpendEvent batches, Bearer device_token
   ▼
api.nomnomtokens.dev  (Nitro on a VPS)        ← a separate app: apps/api
   │  upsert, org scoping, rate limiting
   ▼
Postgres (the same Drizzle schema, pg dialect)
   ▲
   └── OTLP receiver /v1/metrics  ← the no-install entry point:
        the user sets OTEL_EXPORTER_OTLP_ENDPOINT + an auth header, done

app.nomnomtokens.dev  (Nuxt)                  ← a separate web app: apps/cloud
admin.nomnomtokens.dev or /admin              ← the admin panel
```

The local daemon keeps an **outbox**: it always writes to local SQLite first, sends in batches when the network is up, retries with backoff. Local-first stays true — the cloud is a sync layer, never a point of failure.

**Privacy as a sales lever:** only numbers and hashes ever leave the machine (a property of the phase-1 contract). The "what we see and what we never see" page is part of the product, not an appendix.

### 4.2 Authentication

- **Web:** email magic link + GitHub OAuth (nearly mandatory for a developer audience). Library-wise — Better Auth or a Lucia-style approach on top of Nitro; sessions in httpOnly cookies.
- **Agent → API:** device tokens, Sentry/Doppler style. The user clicks "add device" in the web app → gets a short-lived code → `nnt login` exchanges it for a long-lived token stored in `~/.nomnomtokens/credentials` with 600 permissions. The token is bound to user+org and revocable from the UI.
- **Data model:** `users → memberships(role) → orgs → devices → events(org_id)`. Phase-2 roles: `owner`, `admin`, `member`. Every data query is scoped with `WHERE org_id = ?` at the repository layer, not in the handlers.

### 4.3 Team Dashboard (apps/cloud)

The same visualisation core as locally (shared components move to `packages/ui`), plus:
- a per-member breakdown: who ate how much, on which projects;
- organisation aggregates: total burn rate, monthly budget forecast;
- efficiency comparison: cache hit rate and cost per 1,000 lines per person — handled carefully so it doesn't become a surveillance tool: by default a member sees themselves and the aggregates; named breakdowns require role ≥ admin, and it's an organisation-level setting.

### 4.4 Admin Panel

Not a separate product — an `/admin` section inside apps/cloud, gated by role:
- members and invitations (invite links, role changes, deactivation);
- devices and tokens (list, last activity, revocation);
- sources: which adapters are active for whom, data-flow health (last event from a device N minutes ago = signal the agent died);
- organisation privacy settings (named visibility);
- billing for the nomnomtokens subscription itself, when it comes to that (Paddle — you already have integration experience);
- an audit log of administrative actions.

### 4.5 Phase-2 Order of Work

1. `apps/api`: ingest + upsert + Postgres (the schema move is cheap — Drizzle makes the dialect swap trivial)
2. auth: magic link + GitHub OAuth + device tokens
3. `nnt sync`: outbox, batches, backoff
4. `apps/cloud`: the organisation dashboard on shared components
5. admin panel: members → devices → settings → audit
6. the authenticated OTLP endpoint — the entry point for teams unwilling to install an agent
7. billing

Items 1–3 form the minimal "cloud beta" for the first team users; 4–7 grow with demand.

---

## 5. Why This Belongs in a Portfolio (and How to Promote It)

What a client sees in the repository: Nuxt 4 / Vue 3 / TS applied to something non-trivial (a data-dense analytical UI, not CRUD); data work — incremental parsing, dedup, time series, forecasting; architecture — a contract frozen before the second transport existed, a pluggable adapter system, a schema ready for a dialect swap; privacy as a deliberate property; product discipline — a hard MVP and an honest Roadmap.

Promotion: a GIF of the live dashboard in the README and in X/LinkedIn threads; a dev.to technical post on the JSONL format and incremental reading (internals draw more attention than announcements); `docs/adapters.md` as an open door for contributors — the first third-party adapter will be the project's best social proof.

Together with the GSC analytics idea this builds a through-line: **developer tools on top of data developers already have.** Two projects along one line read as a position, not a random assortment.
