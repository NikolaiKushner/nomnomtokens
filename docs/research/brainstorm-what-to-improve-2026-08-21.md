# Brainstorm: what to improve in nomnomtokens

**Date:** 2026-08-21 · **Decision:** which 1–3 features to take after MVP 0.4.0
**Audience:** solos on Claude Pro/Max; people juggling Claude + Codex + Cursor because of limits; (secondary) team leads with AI budgets
**Researcher:** Composer (`/brainstorm`), 5 parallel lanes · on top of [brainstorm-what-to-build-next-2026-08-10.md](./brainstorm-what-to-build-next-2026-08-10.md)

---

## TL;DR

- Demand is still not “how much” but **“where it went / why the wall”** — especially **subagents + Fable/orchestrator**, which burn weekly caps in minutes.
- The category is **even denser**: Jul–Aug wave of Show HN / menu bars / multi-tool meters. **ccusage ~102k/wk**, **nomnomtokens ~40/wk** — another counter will not break out.
- **Multi-harness** is normal (Claude + Codex + Cursor). The product already has adapters — positioning lags.
- **Trust in numbers** is alive: Anthropic itself caveats that local `$` may differ from the bill; competitors have fresh overcount/misprice bugs.
- **Do not build:** an OTLP receiver (Grafana Cloud already officially ingests Claude Code OTel) or “freelancer bills a client” as the headline.

---

## Coverage

| Lane | Where | Items | Confidence |
|---|---|---|---|
| Reddit | r/ClaudeAI, r/ClaudeCode, r/cursor (Arctic Shift / Sentinel; reddit.com 403) | 25 | medium |
| HN + X | Algolia 2026-06→08; X login-walled | 25 HN / ~0 X | high HN, **low X** |
| Competitors | GitHub/npm/docs: ccusage, ccstatusline, Usage Monitor, headroom, sniffly, powerline, Cursor forum | 25 | high |
| Long tail | blogs, menu bars, OTel/Grafana, freelance claims | 25 | high |
| Quant | npm API last-week/month, GitHub stars | 25 | high |
| Product | code + README vs gaps | — | high |
| **Gaps** | X verbatim, YouTube comments, PyPI (429), reaction-sorted GitHub issues | — | — |

---

## Themes, ranked

### 1. Audit of waste / subagents / model — `Pain` · F5 I5 R4 = **14**

People know the limit percentage. They need a lever: what share is subagents, cache, Fable/Opus, context reload.

> "My Claude Code setup burned 36% of my weekly Fable cap in 32 minutes." — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vg51s8/my_claude_code_setup_burned_36_of_my_weekly_fable/)
> "Using Fable as an Orchestrator + Subagents saves or burns tokens?" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vsrzg3/using_fable_as_an_orchestrator_subagents_saves_or/)
> "one deep-research launch ran 84 agents on Fable 5" — [anthropics/claude-code#75055, 2026-07](https://github.com/anthropics/claude-code/issues/75055)
> "i did audit of 926 sessions and found a lot of the waste was on my side." — [r/ClaudeAI, 2026-04](https://www.reddit.com/r/ClaudeAI/comments/1sd8z2q/anthropic_isnt_the_only_reason_youre_hitting/)
> "I kept hitting usage limits in the middle of a task and couldn't figure out where the tokens were going." — [HN, 2026-08](https://news.ycombinator.com/item?id=49272665)

**So what:** nnt already has `meta.sidechain`, cache buckets, `unitLabel`, Providers with cache hit — but no screen/command with conclusions. `sidechain` is written and **never aggregated**.

### 2. Usage anxiety + wall without warning — `Pain` · F5 I4 R4 = **13**

> "What really sucks right now with cc on max 20x is usage anxiety." — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vtxm24/usage_anxiety_on_20x/)
> "I haven’t used Claude for three days, but my limits keep getting consumed automatically" — [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1v8d1ck/possible_claude_max_usage_bug_session_limit/)
> "constantly doing mental math on whether or not I would run out of coding agent usage prematurely." — [HN AgentPace, 2026-06](https://news.ycombinator.com/item?id=48555431)
> "Pacer shows your Claude Code usage in real-time" — [HN, 2026-08](https://news.ycombinator.com/item?id=49376805)

**So what:** Limits + alerts already exist. Gap — warning **where people work**, and cross-agent headroom.

### 3. One view across all harnesses — `Pain` · F5 I4 R4 = **13**

> "Anyone else multi-harnessing due to token limits?" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vjrwhy/anyone_else_multiharnessing_due_to_token_limits/)
> "could never tell how much I was actually consuming across all of them." — [HN TokenMaxxer, 2026-08](https://news.ycombinator.com/item?id=49157983)
> "Show HN: Tokimeter – open-source usage meter for Claude, Codex, Cursor and more" — [HN, 2026-07](https://news.ycombinator.com/item?id=49098981)
> "Every AI coding limit, in your menu bar." — [CodexBar](https://github.com/steipete/CodexBar)

Quant: Codex/Cursor tracker search is still thin vs Claude-only tools — the multi-agent niche is **claimed** by many, **closed** by few with SQLite history.

**So what:** three adapters already in code; README leads Claude-first. Positioning is cheaper than a feature.

### 4. Nobody trusts the numbers — `Objection` · F5 I5 R4 = **13**

> "Claude Code computes the dollar figure locally … may differ from your actual bill" — [Anthropic docs, 2026-08](https://docs.anthropic.com/en/docs/claude-code/costs)
> "Token widgets over-report ~1.84x … one JSONL entry per content block" — [ccstatusline#549, 2026-08](https://github.com/sirmalloc/ccstatusline/issues/549)
> "Session cost/tokens still double-counted in TUI mode" — [claude-powerline#103, 2026-08](https://github.com/Owloops/claude-powerline/issues/103)
> "priced at legacy Opus 3 rate … a 3x" — [Usage-Monitor#241, 2026-08](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/241)
> "Some people read it as actual spend, so we decided to remove that graph." — [HN Cursor staff, 2026-08](https://news.ycombinator.com/item?id=49136792)

**So what:** the niche “here is our figure, here is the vendor’s, here are the blind spots” is free. README is already honest about 2.3× — next step is CLI/`reconcile`, not another disclaimer.

### 5. “Do I need Max 20x?” — `Desire` · F4 I3 R5 = **12**

> "Upgraded from Claude Max 5x to 20x and still hit … within two days" — [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1vbvy51/upgraded_from_claude_max_5x_to_20x_and_still_hit/)
> "20x max gives 4x for a given 5 hr window but only doubles the weekly total." — same thread (Sentinel)
> "while I pay just $200/month for Claude Code, it is easy to spend $2000 worth in tokens a week." — [HN, 2026-08](https://news.ycombinator.com/item?id=49255546)

**So what:** distribution channel (`nnt verdict`), not a moat.

### 6. Team / per-engineer AI spend — `Pain` · F3 I5 R2 = **10**

> "We are looking for ways to mitigate token/cost waste" — [r/ClaudeAI statusline enterprise, 2026-08](https://www.reddit.com/r/ClaudeAI/comments/1vnnc32/using_statusline_for_enterprise_or_team_usage_to/)
> "blowing their yearly AI spend faster than" — [HN Tokenless, 2026-07](https://news.ycombinator.com/item?id=49099143)

**So what:** moneyed, but far from a local-first solo product (cloud phase-2).

---

## Competitive landscape (snapshot 2026-08-21)

| Product | Who for | Price | Strength | Loudest complaint |
|---|---|---|---|---|
| ccusage | CLI totals, multi-agent adapters | OSS | 18k★ · **102k/wk npm** | limits lag, cache cost gaps |
| ccstatusline | Pretty statusline | OSS | 12.5k★ · 21k/wk | ~1.84× overcount; hook trust |
| Claude-Code-Usage-Monitor | Live TUI + predict | OSS | 8.6k★ · quieter push since Jul | wrong remaining; Opus misprice |
| headroom (domanski-ai) | Multi-account rotate | OSS | ~99★ · since 2026-07 | macOS re-login stuck |
| sniffly | Dashboard + share | OSS | ~1.3k★ | figures vs other trackers |
| Menu bars (CodexBar, LimitBar, slopbill, …) | Quota in chrome | OSS | mixed | not history / not audit |
| **nomnomtokens** | Local dashboard + history | OSS | **1★ · 40/wk** | unknown to the market |

New Show HNs (Jul–Aug): TokenMaxxer, Tokimeter, Pacer, Frugal Tokens, AgentPace, e-ink usage screen — confirm demand for **pace + multi-tool**, not “another ccusage”.

---

## Quant

| What | Number | Source |
|---|---|---|
| Claude Code CLI | 18,259,096/wk | [npm](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code) |
| ccusage | 102,221/wk · 18,088★ | [npm](https://api.npmjs.org/downloads/point/last-week/ccusage) / [GitHub](https://github.com/ccusage/ccusage) |
| ccstatusline | 21,049/wk · 12,505★ | npm / GitHub |
| **nomnomtokens** | **40/wk · 1★ · npm 0.4.0** | [npm](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) |
| Claude-Code-Usage-Monitor | 8,648★ · last commit ~Jun | GitHub |
| Tracker/agent conversion (ccusage) | ~0.56% weekly npm | computed |

Since Aug 10: ccusage 83k→102k; nnt “558/wk in week one” → 40/wk now — normalisation after launch spike, not growth.

---

## Tailwind / risk

- Cursor removed dollars from the Usage page ([forum](https://forum.cursor.com/t/usage-page-to-token-amount-what/167153), [HN 337 pts](https://news.ycombinator.com/item?id=49135257)) — wind for local trackers.
- Anthropic promised predictability — risk that `/usage` eats part of the “show %” niche.
- Official [Grafana Cloud Claude Code OTel](https://grafana.com/docs/grafana-cloud/monitor-infrastructure/integrations/integration-reference/integration-claude-code/) — kills the case for our own OTLP receiver as Next.

---

## Silences

1. **Freelancer splitting spend by client** — still almost no first-person signal (one TokenBBQ product blog). README used to sell Projects that way.
2. **Visual polish of trackers** — nobody complains they look bad.
3. **OTLP receiver as a product** — people want *export* into their stack, not another receiver.

---

## Interpretation — my read, not evidence

**First.** The “show a number” layer is lost even harder than on Aug 10. Defensible positions: **history + behaviour audit + several agents in one store** — exactly what a storage-less CLI cannot do.

**Second.** The August Fable/subagent signal strengthens bet #1 from the prior digest: not abstract “waste”, but **sidechain share + model mix + cache** with an actionable tip.

**Third.** Roadmap “Next: OTLP → cloud” should be rewritten. OTLP is not a bet; cloud/teams is phase-2 with low R for solo OSS right now.

---

## Candidate bets

1. **`nnt audit` / Overview “where it went”** — cache vs fresh, sidechain share, model mix, top sessions, 1–3 tips. Evidence: theme 1. Risk: Cursor/Codex without `sidechain` — show N/A honestly.
2. **Multi-agent positioning + pacing tip** — README/hero + statusline/alerts headroom. Evidence: themes 2–3. Risk: Cursor often has no local tokens.
3. **`nnt reconcile`** — local vs vendor/CSV, explicit unknowns. Evidence: theme 4.
4. **`nnt verdict` (Max 20x)** — shareable verdict. Evidence: theme 5. This is distribution.
5. **Do not take:** OTLP receiver; freelancer-billing as headline; “another pretty statusline”.

**Next:** [docs/plans/nnt-audit.md](../plans/nnt-audit.md) — plan for bet #1.

---

## Appendix — key evidence

| # | Source | Date | URL | Quote gist |
|---|---|---|---|---|
| 1 | Reddit | 2026-08 | /r/ClaudeCode/1vg51s8 | 36% Fable weekly in 32 min |
| 2 | GitHub | 2026-07 | anthropics/claude-code#75055 | 84 Fable agents one workflow |
| 3 | Reddit | 2026-08 | /r/ClaudeCode/1vjrwhy | multi-harnessing due to limits |
| 4 | HN | 2026-08 | item?id=49157983 | TokenMaxxer cross-agent |
| 5 | HN | 2026-08 | item?id=49135257 | Cursor removed $ usage |
| 6 | Anthropic | 2026-08 | docs Claude Code costs | local $ may differ from bill |
| 7 | GitHub | 2026-08 | ccstatusline#549 | ~1.84× over-report |
| 8 | npm | 2026-08 | ccusage last-week | 102221 downloads |
| 9 | npm | 2026-08 | nomnomtokens last-week | 40 downloads |
| 10 | Grafana | 2026-03 | Claude Code OTel integration | official org cost tracking |

**Caveats:** reddit.com 403 — texts via archives/mirrors; X unreachable; PyPI 429.
