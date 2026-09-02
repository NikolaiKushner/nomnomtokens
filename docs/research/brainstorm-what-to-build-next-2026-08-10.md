# Brainstorm: what to build next in nomnomtokens

**Date:** 2026-08-10 · **Decision:** which 1–3 features to ship after the MVP
**Audience:** developers on Claude Pro/Max who cannot see where their limit goes; team leads with AI tooling budgets; (hypothetically) freelancers attributing spend to clients
**Researcher:** Claude (`/brainstorm`), 5 parallel lanes

---

## TL;DR

- Demand has shifted from **“how much”** to **“on what, and how much of that is waste”**. “How much” is covered by ccusage and built-in `/usage`; “on what” is covered by nobody.
- The loudest and emptiest position is **distrust of the numbers**. Two popular trackers report $62.11 and $116.01 for the same month, and users know it.
- **Per-client attribution for freelancers did not show up at all.** Three lanes searched independently and found zero live people. That was a claimed killer feature in the README.
- The category is crowded: “someone counted 23 of these tools back in April.” Building another number-shower is a bad bet.
- Vendors are **removing** spend visibility (Cursor stripped dollars from the usage page; Anthropic hid the tracker link) — a tailwind, but also a sign the problem is political, not only technical.

---

## Coverage

| Lane | Where | Items | Confidence |
|---|---|---|---|
| Reddit | r/ClaudeAI, r/ClaudeCode, r/cursor, r/ChatGPTCoding, r/ExperiencedDevs, r/freelance | 25 | medium — reddit.com returned 403; all via Redlib mirror |
| HN + X | Algolia API, stories + comments | 25 | high on HN, **low on X** (x.com returned 402) |
| Competitors | GitHub API/issues across 12+ repos, npm, Anthropic docs | 25 | high |
| Long tail | dev.to, Medium, personal blogs, Cursor forum, SO | 25 | high |
| Quant | npm API, GitHub API, official pricing | 28 | high on npm/GitHub, **estimates for Reddit sizes** |
| **Gaps** | X/Twitter, YouTube comments (Google `/sorry/`), exact subreddit sizes, PyPI | — | — |

---

## Themes, ranked

### 1. The meter shows a number but not what to do with it — `Pain` · F5 I5 R4 = **14**

People already know the total. They need an **audit**: what share of spend is waste, and which lever removes it. Recurring discoveries: cache reads are 98% of tokens and 72% of the bill; context reload on a new session is ~40% of spend; subagents burn ~3× expectations; compaction hides 80% of consumption; 85% of tasks did not need Opus.

> "It doesn't tell me why, or what I need to change to spend less" — [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1usm3uw/more_than_60_of_my_claude_usage_was_wasted/) (author found $136 of $203 was recoverable waste)
> "ccusage tells you what you spent. I wanted to see when and on what" — [r/ClaudeCode, 2026-07](https://www.reddit.com/r/ClaudeCode/comments/1v6xfjp/found_out_id_spent_2k_on_claude_code_so_i_built_a/)
> "Basically half my turn count this month was chat, not building. Had no idea that ratio was so off." — [HN, 2026-04](https://news.ycombinator.com/item?id=47812549)
> "noticing a $65 charge for what felt like a $10 session. Turns out, context compaction was hiding 80% of my token usage." — [HN, 2026-03](https://news.ycombinator.com/item?id=47380204)
> "no token breakdown, no per-task cost visibility, just a quota that mysteriously shrinks" — [r/ClaudeCode, 2026-04](https://www.reddit.com/r/ClaudeCode/comments/1t0avra/i_cancelled_my_200_max_plan_after_routing_cut_my/) (440 upvotes)

Subagents are an open hole for **everyone**: [claude-powerline#27](https://github.com/Owloops/claude-powerline/issues/27) — “Although they burn huge amounts of tokens, this is not reflected in the estimated costs”; the segment showed 35%, built-in `/usage` showed 75%.

**So what:** nomnomtokens already has Providers with cache hit rate and cost/1k lines — closer to an audit than anything else on the market, but presented as a metric, not a conclusion.

### 2. Nobody trusts the numbers, including ours — `Objection` · F5 I5 R4 = **14**

This is an objection to the whole category at once.

> "Obviously, none of them are correct." — [sniffly#19, 2025-11](https://github.com/chiphuyen/sniffly/issues/19#issuecomment-3531450189) (two popular trackers: $62.11 vs $116.01 for one month)
> "The trackers I tried read the local session-log JSONL, which doesn't actually carry billing-grade cost — so the totals drift from what you're billed" — [r/ClaudeAI, 2026-06](https://www.reddit.com/r/ClaudeAI/comments/1u3aqc3/i_got_tired_of_my_claude_code_spend_not_matching/)
> "the API side is documented down to the multiplier, the subscription side isn't documented at all" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vejlfo/nobody_outside_anthropic_can_tell_you_whether/)
> "I've hit my usage limit, but my plan usage tracker shows that I've got plenty left" — [r/ClaudeAI, 2026-06](https://www.reddit.com/r/ClaudeAI/comments/1u3uiyu/am_i_missing_something_usage_limit_reached_but/)
> "monitor dosnt look accurate" — [Claude-Code-Usage-Monitor#212, 2026-05](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor/issues/212) (only issue on an 8.6k-star repo ranked by reactions)

Plus structural bugs at the leader: [ccusage#1591](https://github.com/ccusage/ccusage/issues/1591) — holes in the price table silently zero cost; [ccusage#705](https://github.com/ccusage/ccusage/issues/705) — 8,836 output tokens counted as 13.

Backdrop — [class action against Anthropic](https://www.reddit.com/r/ClaudeAI/comments/1u6kzsr/anthropic_has_been_sued_for_allegedly_misleading/) over allegedly misleading Max 20x limits (1,902 upvotes) and [forensics on 119,866 local calls](https://github.com/anthropics/claude-code/issues/46829) proving a quiet cache TTL change. Local logs are already used **as evidence against the vendor bill**.

**So what:** no tool in the category admits its error bars out loud. The position “here is our figure, here is the vendor’s, here is the gap, here is what cannot be known” is free.

### 3. AI spend became an untagged cloud bill — `Pain` · F5 I5 R3 = **13**

> "The console gives you aggregate spend, not which engineer, which repo, which flow" — [r/ClaudeCode, 2026-07](https://www.reddit.com/r/ClaudeCode/comments/1v9hfow/finance_asked_me_what_we_spend_per_engineer_on/) (bill 4× from Feb to Jul)
> "I think these companies want to make token usage opaque. Not dissimilar from an AWS bill at most orgs." — [HN, 2026-08](https://news.ycombinator.com/item?id=49137130)
> "$1,500 in a single day, nobody noticed until we checked the admin dashboard days later" — [r/ChatGPTCoding, 2026-03](https://www.reddit.com/r/ChatGPTCoding/comments/1ro9772/has_anyone_figured_out_how_to_track_perdeveloper/) (50 Cursor Enterprise seats, shared pool)
> "AI spend has become the new cloud cost problem, except there's no Datadog for it." — [dev.to, 2026-02](https://dev.to/ofershap/i-built-a-cursor-plugin-to-track-my-teams-ai-spend-from-the-ide-2d53)
> "we have a daily limit of $90. If we go beyond that limit, we have to ask our managers to increase our daily allowance" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vhxlhh/my_company_now_has_daily_limits_to_claude_code/)

Reference thread: [Uber $1,500/dev/month](https://news.ycombinator.com/item?id=48383056), 624 points / 769 comments.

**So what:** the most moneyed theme and the farthest from the current product — phase-2 cloud mode. R=3 because solo OSS reaches teams poorly.

### 4. The wall is invisible until you hit it — `Pain` + `Workaround` · F5 I4 R4 = **13**

> "The thing that drives me nuts isn't the limits themselves — it's that I never see them coming" — [r/cursor, 2026-05](https://www.reddit.com/r/cursor/comments/1tmbx19/got_tired_of_hitting_limits_with_zero_warning_so/)
> "Your only feedback mechanism is hitting the wall mid-conversation and getting rate-limited into oblivion for a few hours. No warning." — [dev.to, 2026-04](https://dev.to/stevengonsalvez/ccusage-finally-know-how-much-claude-code-is-actually-costing-you-1873)
> "my session was at 6%, basically untouched, but my weekly was already at 84%" — [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1v7ysxr/150k_context_was_quietly_draining_my_weekly/)
> "Eight lines of cron. Three afternoons a week back." — [Medium, 2026-05](https://medium.com/@AymanAlkurdi/stop-hitting-claudes-rate-limit-at-11-am-7cad2b7db3d9) (cron fires empty `claude -p` at 6am to shift the reset window off the workday)

**So what:** nomnomtokens **already has** burn forecasts and alerts. Remaining gap: the warning does not arrive where the person works, and it ignores a second agent sitting on unused headroom.

### 5. “Do I need Max 20x?” — the most shareable question — `Desire` · F5 I3 R5 = **13**

> "Everyone knows the 5-hour window meme but nobody knows where they personally sit in it" — [r/ClaudeAI, 2026-08](https://www.reddit.com/r/ClaudeAI/comments/1vgy8d6/kept_wondering_if_i_actually_need_max_20x_so_i/) (analyzed 469 windows: 48% would hit Pro, 1.1% Max 20x)
> "$6,677.54 total in 37 days, vs ~$243 of subscription over the same window" — [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1v3pfbh/ran_ccusage_on_my_max_20x_6677_of_apirate_usage/)
> "According to ccusage I use about $5k of tokens on my $100/mo Claude Max plan" — [HN, 2026-08](https://news.ycombinator.com/item?id=49137363)
> "it weights each token type by its API cost and derives the actual dollar budget anthropic allocates per window" — [r/ClaudeCode, 2026-03](https://www.reddit.com/r/ClaudeCode/comments/1s7ilti/what_does_20x_usage_actually_mean_i_measured_it/) (reverse-engineering: $363 / 5h, $1,900 / 7d for Max 20x; tracks drift to catch quiet nerfs)

**So what:** R=5 — the only theme people **post and repost themselves**. Revealed behaviour: wild ccusage use is mostly arbitrage bragging, not budgeting. That is a distribution channel, not a feature.

### 6. Multi-tool: one agent empty, another idle — `Pain` · F4 I4 R4 = **12**

> "because I have no daily discipline and no single place to see total AI spend … ccusage — excellent, but Claude Code only" — [r/cursor, 2026-04](https://www.reddit.com/r/cursor/comments/1ssh5o6/how_do_you_pace_cursor_ultra_claude_code_usage/)
> "i timed it one week … 1h40 across five days just retyping context into a fresh session" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vi844z/i_pay_200m_for_claude_and_codex_and_was_still/) (pays $100 Claude + $100 Codex and still idles half the day)
> "I periodically get locked out mid-task and spend ten minutes figuring out which tool ran out, when it resets, and whether I should switch models" — [blog, 2026-03](https://ianlpaterson.com/blog/tracking-claude-codex-gemini-quotas-from-one-script/) (~250 lines of bash/Python/JS on an hourly cron, normalising three quotas into one JSON)
> "None of them talk to each other." — [dev.to, 2026-04](https://dev.to/zagentz/how-i-track-claude-code-token-costs-1949)

Quant confirms the niche is thin: `gh search repos "codex cli usage cost"` and `"LLM token cost tracking cli"` returned **empty lists**; top Cursor tracker — 32 stars.

**So what:** already built (Claude Code / Codex / Cursor adapters), but nowhere claimed as the headline. Positioning lags the code.

### 7. Data does not gather across machines and accounts — `Pain` · F4 I3 R4 = **11**

> "The figures are approximate and computed from local session history on this machine, so usage from other devices or claude.ai is not included." — [Anthropic docs, 2026-08](https://code.claude.com/docs/en/costs)
> "it makes it difficult to get an accurate total usage when a user operates Claude Code on multiple personal computers" — [ccusage#222, 2025-06](https://github.com/ccusage/ccusage/issues/222) — open for over a year
> "Track and rotate your Claude & Codex usage across accounts from one live dashboard" — [headroom](https://github.com/domanski-ai/headroom), created 2026-07-12, already 98 stars

**So what:** a hole the leader has not closed in a year, and that built-in `/usage` admits explicitly.

### 8. Source data self-destructs — `Pain` · `single-source`

> "It turns out that, by default, Claude Code erases your sessions after 30 days." — [HN, 2026-06](https://news.ycombinator.com/item?id=48571537)

One source, so not top-ranked. Structurally important: a history product sits on data the vendor deletes.

---

## Tailwind: spend visibility is being cut

Not a user pain — a market move — but it decides how long the niche lasts.

> "Cursor removed cost information from the usage page and CSV export" — [HN, 2026-08](https://news.ycombinator.com/item?id=49135257) (336 points, 153 comments)
> "Their solution to people complaining about usage is apparently to make it harder to observe" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vfntgz/claude_just_removed_the_quicklink_to_usage/)
> "We are actively working on improving rate limit predictability and visibility into token usage." — [HN, 2026-04](https://news.ycombinator.com/item?id=47740733) — Claude Code lead (bcherny)

That last quote is a risk, not a gift: the vendor publicly promises to close exactly the hole the category sits on.

---

## Silences — what nobody complains about

1. **Freelancer attributing spend to clients.** Three lanes searched independently. r/freelance: 75 results across four queries, **zero**. HN: zero for `freelance bill client AI tokens`, `consultant charge client Claude Code`. Long tail: no first-person stories, only vendor marketing ([tokenwatch.one](https://www.tokenwatch.one/blog/claude-code-cost-monitoring)). Closest real analogue is per-engineer attribution **inside companies**, not per client. README called this “the one that lets a freelancer bill a client”; no evidence.
2. **Nobody complains about tracker looks.** The spec thesis that “visual and distinctive” is a differentiator is unsupported by the collected data.
3. **Nobody asks for an OTLP receiver** — the then-current “Next” on the roadmap. Two people ([braw.dev](https://braw.dev/blog/2026-03-28-monitor-claude-usage-with-grafana/), [tcude.net](https://tcude.net/how-i-monitor-my-claude-code-usage-with-grafana-opentelemetry-and-victoriametrics/)) built Grafana+OTel themselves — they needed a **source for their own stack**, not another receiver.

---

## Contradictions and corrections

- **The category is called saturated from inside.** [r/ClaudeAI, 2026-07](https://www.reddit.com/r/ClaudeAI/comments/1v3yjqh/every_tool_tells_me_what_my_sessions_cost_i/): “Someone counted 23 of them back in April and built a menu bar app to track the trackers.” Meanwhile ccusage grew ~6× Oct→Jul — so the “show a number” layer is saturated, not demand itself.
- **Built-in `/usage` did not kill ccusage**, but closed in: it now breaks spend down by skills/subagents/plugins/MCP. No direct “I uninstalled because of `/usage`” evidence — a null result, not proof of safety.
- Reddit and HN skew technical and complaint-heavy; that is the whole pool. Team leads appear in their own words; finance does not.
- Stated intent ≠ paid behaviour. The whole pool is free OSS with zero G2/Trustpilot reviews. **No evidence of willingness to pay for anything in this category was found.**

---

## Scale (for calibration, not bragging)

| What | Number | Source |
|---|---|---|
| Claude Code CLI | 15,100,156 npm downloads / week | [npm API](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code) |
| ccusage | 83,521/wk · 17,837 stars · push today · ×6 Oct→Jul | [npm](https://api.npmjs.org/downloads/point/last-week/ccusage) / [GitHub](https://github.com/ccusage/ccusage) |
| ccstatusline | 20,296/wk · 12,322 stars | [npm](https://api.npmjs.org/downloads/point/last-week/ccstatusline) |
| Claude-Code-Usage-Monitor | 8,609 stars, **no commit since 2026-07-10** | [GitHub](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) |
| **nomnomtokens** | **558/wk, package 7 days old** | [npm](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) |
| Top Cursor tracker | 32 stars | `gh search repos` |
| Codex CLI trackers | search returned empty | `gh search repos` |

ccusage / Claude Code ≈ 0.55%. The niche is real; conversion from agent user to tracker user is low for everyone.

---

## Interpretation — my read, not evidence

Three conclusions I own, not the sources.

**First.** The “show a number” layer is lost — ccusage is an order of magnitude ahead and commits daily. The only defensible positions are ones the incumbent cannot reach structurally: it is a CLI without storage, so **history, multi-machine rollup, and behaviour audit over time** need a rewrite. nomnomtokens already has SQLite and adapters. That is the moat, and it is not about dashboard chrome.

**Second.** Trust (#2) looks like the best move precisely because it is uncomfortable. Every competitor pretends its figure is exact; users know it is not. The first tool to say “here is ours, here is the vendor’s, here is the gap, here is what we cannot know” takes a position that is painful to copy, because copying admits your own error bars.

**Third.** I would demote the freelancer persona in the README to a hypothesis until one live person appears. Three lanes at zero is not “we searched badly” — it is an answer. Intra-company per-engineer attribution, by contrast, is densely confirmed — if attribution is next, go there.

---

## Candidate bets

1. **Audit instead of a counter** — screen/command “where it went and what of that is recoverable”: cache reads vs fresh tokens, context-reload cost, subagent spend, share of Opus tasks that Sonnet would have covered. Themes 1+5. Densest evidence base, and exactly what ccusage does not do.
2. **`nnt reconcile` — trust mode** — reconcile local totals with what the vendor shows, with an explicit “here is the gap, here is what cannot be known”. Theme 2. Niche free; painful to copy.
3. **Multi-machine / multi-account rollup** — one store from several hosts/accounts. Theme 7. Hole open at the leader for over a year and admitted in Anthropic’s official docs.
4. **Warning where people work** — not a dashboard, but a pre-wall intercept: “at this burn you have 40 minutes,” plus cross-agent “Codex still has headroom, switch.” Themes 4+6.
5. **`nnt verdict` — “do you need Max 20x”** — one command, one shareable verdict from your history. Theme 5. Distribution channel, not a feature: the only format people in this niche post themselves.

**Next:** `/plan <bet>` — the plan skill reads this file.

---

## Appendix — raw evidence

Full pool (128 items across five lanes) was gathered in-session; every quote above that a theme rests on carries a link and date. Five lane reports came from `general-purpose` subagents on 2026-08-10 and were not edited when quotes were lifted.

**Access caveats for re-checking:**
- `reddit.com` returned 403 on everything including `.json`; Reddit evidence via Redlib mirror (safereddit.com), links rewritten to canonical form. Texts and dates from the mirror.
- `x.com` returns 402; pages unreadable. Two X items from search-result titles; dates decoded from snowflake IDs. Low confidence.
- Subreddit sizes — third-party estimates (subranking, gummysearch); official `about.json` needs a token. Two sources on r/ClaudeAI disagree: 1,043,382 vs “1.1M”.
- Dates on three dev.to articles came back wrong from a summariser and were re-checked via `dev.to/api/articles`.
