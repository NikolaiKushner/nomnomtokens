# Brainstorm: что добавить в nomnomtokens после verdict и cold resume

**Date:** 2026-09-24 · **Decision:** какие 1–3 фичи брать следующими
**Audience:** соло на Claude Pro/Max, которые параллельно сидят в Codex и Cursor из‑за лимитов
**Researcher:** Cursor Grok (`/brainstorm`), 5 полос · поверх [2026-09-02](./brainstorm-what-to-improve-2026-09-02.md)

Уже в продукте и в эту выборку не возвращалось как «дыра»: `nnt audit` с cold resume, `nnt verdict`, statusline weekly-first + Codex headroom, `nnt import`/`export` архива, предупреждение `doctor` про `cleanupPeriodDays`.

## TL;DR

- Единица лимита по-прежнему не документирована, и за три недели она ещё и поехала: Opus 5.5, Fable и Codex Astra сжигают неделю так, что 5‑часовой % это не объясняет.
- Локальный JSONL люди уже сверяют с метром сами — и он не сходится (ccusage врёт в 2× на релизе, один профайлер видит 39% «billed growth»). Ниша `reconcile` снова громкая.
- Слой «процент в менюбаре» закрыт ещё плотнее: CodexBar 21.8k★, codenotch набрал 2.4k★ за 19 дней. Ещё один meter не взлетит.
- Codex CLI по npm обогнал Claude Code (14.7M vs 8.7M за неделю). Мульти-харнесс — дефолт.
- nomnomtokens: 6 npm/нед., 0★, публичный пуш 2 сент. Фича без формата, который люди сами постят, останется невидимой.

## Coverage

| Lane | Where | Items | Confidence |
|---|---|---|---|
| Reddit | r/ClaudeCode, r/cursor (Arctic Shift; reddit.com 403) | 25 | medium |
| HN + X | Algolia с 2026-09-02 | 25 HN / 0 X | high HN, **нет X** |
| Competitors | GitHub issues/releases, npm | 25 | high |
| Long tail | Anthropic/OpenAI/Cursor docs, issues, dev.to | 25 | high; часть wipe-issues — август |
| Quant | npm API, GitHub API, search | 25 | high |
| Gaps | X, r/ClaudeAI (422), G2/Trustpilot, reactions-sort CodexBar (403) | — | — |

## Themes, ranked

### 1. Процент лимита нельзя перевести в ход — `Pain` · F5 I5 R5 = **15**

Люди знают, что 20x — это 5‑часовое окно. Новый вопрос: сколько недельных процентов съел этот промпт, и почему Opus 5.5 / Astra двигают неделю иначе, чем сессию. Единицу метра никто не публикует, поэтому все меряют сами.

> "What i cant measure is the fluctuation in the value of 1 unit" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wn0xn9/max20x_is_now_just_15_times_better_than_max5x/)
> "the unit of those meters is not documented anywhere." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wjsb04/i_measured_what_prompt_caching_actually_costs/)
> "I noticed it uses 10% weekly usage when I got to around 80% session limit." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wonn3t/opus_55_uses_more_weekly_limit/)
> "I just burned ~20% of my weekly quota with Astra making one config file" — [HN, 2026-09](https://news.ycombinator.com/item?id=49807336)
> "two 5x plans > 20x at greater than half the cost" — [HN, 2026-09](https://news.ycombinator.com/item?id=49806218)

**So what:** `nnt verdict` отвечает «какой план», но не «этот ход стоил N% недели». В одном store уже лежат и снимки лимита, и события — это стык, которого нет у CLI без истории.

### 2. Локальный лог не равен метру — `Objection` · F5 I5 R4 = **14**

Недоверие вернулось с вендора на трекеры и на сам JSONL. Официальные `$` не равны счёту. Люди постят сверки. ccusage на один релиз удвоил сумму и тут же это чинил.

> "The transcript on disk only covers roughly 39% of the per turn billed growth." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wf1mha/built_with_claude_code_a_local_profiler_for/)
> "When measuring with ccusage, I consumed $110 @ 63%. This is $100+ off" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1w6cy7b/something_is_wrong_with_usage_and_i_can_prove_it/)
> "the figures in `/usage`, the status line, and OpenTelemetry don't match your bill." — [Anthropic docs, 2026-09](https://code.claude.com/docs/en/costs)
> "Token counts are ~2x too high since v20.0.21" — [ccusage#1762, 2026-09](https://github.com/ccusage/ccusage/issues/1762)
> "I got tired of guessing what the weekly limit actually meant" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wk3zq5/i_audited_my_session_logs_against_the_usage_meter/)

**So what:** честный разрыв «вот наши токены, вот % метра, вот что JSONL не видит» снова свободная позиция. Копировать больно: надо признать слепую зону.

### 3. Кэш схлопнулся до 5 минут, и платит подписка — `Pain` · F5 I5 R4 = **14**

Cold resume основного чата люди уже выучили. Новое: субагенты живут на 5‑минутном кэше, поле `prompt_cache` падает с 1h до 5m, resume субагента переписывает префикс. Вопрос не «сколько $», а «сколько лимита съест промах».

> "sub-agents default to a 5-minute prompt cache while the main session gets 1 hour." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wkpm2i/claude_code_subagents_have_a_5m_prompt_cache_long/)
> "This weekend it is 5 minutes for me." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wfwf58/limits_drain_and_prompt_cache/)
> "the cache miss alone would cost like $9.38 … and I assume it would eat a ton of usage?" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wlfofw/cache_miss_cost/)
> "mid session swapping invalidates the cache, which drives cost quite a lot" — [HN, 2026-09](https://news.ycombinator.com/item?id=49826647)
> "The session's prompt cache has expired by then, so the next request processes the full history once" — [Anthropic docs, 2026-09](https://code.claude.com/docs/en/sessions)

**So what:** cold resume v1 это не закрывает. Дырка — TTL субагента и цена промаха в единицах лимита.

### 4. Какое место ещё живое — `Desire` · F4 I4 R4 = **12**

Люди держат два Pro, Claude+Codex, и сами пишут переключатели. Хотят не дашборд, а «у кого осталось и когда ресет».

> "how much quota do I have left on each one, and when does it reset?" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1whywdz/cli_and_terminal_dashboard_for_your_claude_code/)
> "I would like to switch to Claude Code before Codex limits hit." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wg7j5q/is_there_any_way_to_stop_process_and_clean_up/)
> "Setup is 2x Pro at $20 each, desktop plus work laptop" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wkhzjq/i_max_both_my_pro_weeklies_every_week_measured/)
> "it can't see usage from claude.ai, mobile, or another machine." — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1wl9ab4/is_it_against_anthropic_terms_to_use/)
> "Aggregates usage across all your Macs via a folder you already sync" — [MyUsage, 2026-09](https://github.com/zchan0/MyUsage)

**So what:** Codex headroom в statusline — один харнесс. Нет вида «несколько домов / аккаунтов». Облако для этого не нужно: папка, которую человек и так синкает.

### 5. Процент должен быть на экране всегда — `Desire` · F5 I4 R2 = **11**

CodexBar, UsageBar (macOS и Windows), Claude Meter, orbit, Ration, AgentLimits, codenotch. Желание реальное, место занято.

> "Every AI coding limit, in your menu bar." — по-прежнему [CodexBar](https://github.com/steipete/CodexBar), 21 855★, пуш 2026-09-24
> "Show HN: UsageBar – A Windows tray app for monitoring Claude Code usage" — [HN, 2026-09](https://news.ycombinator.com/item?id=49816102)
> "pins Claude/Cursor/Codex/Antigravity limits" — [codenotch](https://github.com/vinzdg/codenotch), репо с 2026-09-05, 2 431★

**So what:** не строить менюбар. R=2 для нового дашборда: доставка этого желания уже не наша.

### 6. Фон доедает лимит — `Pain` · F2 I4 R3 = **9** · `single-source` cluster

Два issue одной недели, не независимые площадки. Не в топ.

> "the shorter rolling/session limit would repeatedly reach 100% despite me not actively using Claude" — [claude-code#96630, 2026-09](https://github.com/anthropics/claude-code/issues/96630)
> "My 5hr usage jumped from 0% to 100% within seconds of the usage limit reset." — [claude-code#92654, 2026-09](https://github.com/anthropics/claude-code/issues/92654)

## Competitive landscape

| Product | Who | Pricing | Strength | Loudest complaint |
|---|---|---|---|---|
| CodexBar | все лимиты в менюбаре | OSS | 21 855★, пуш сегодня, 80 провайдеров | stale Claude quota, keyring $0, CPU |
| ccusage | CLI-тоталы | OSS | 18 725★ · 116k npm/нед. | cold statusline 9.5s; релиз 20.0.21 удвоил токены |
| ccstatusline | statusline | OSS | 13 006★ · 48k/нед. | Enterprise usage API → виджеты 0% |
| codenotch | пины лимитов | OSS | 2 431★ за 19 дней | новый, жалоб ещё нет |
| Claude `/usage` | встроенный разбор | bundled | официальный | this-machine; $ ≠ bill |
| **nomnomtokens** | local history | OSS | **6/нед. · 0★ · push 2026-09-02** | рынок нас не видит |

`plan verdict` и `cold resume` как фразы в issues конкурентов за окно не нашлись. tare последний код — 2026-08-28.

## Quant

| What | Number | Source |
|---|---|---|
| Codex CLI | 14 692 991 / нед. | [npm](https://api.npmjs.org/downloads/point/last-week/@openai/codex) |
| Claude Code CLI | 8 669 665 / нед. | [npm](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code) |
| ccusage | 115 783 / нед. · 18 725★ | npm / [GitHub](https://github.com/ccusage/ccusage) |
| ccstatusline | 47 555 / нед. · 13 006★ | npm / GitHub |
| CodexBar | 21 855★ | GitHub API 2026-09-24 |
| codenotch | 2 431★, создан 2026-09-05 | GitHub API |
| repos `"claude code usage"` after 2026-09-01 | 119 | [GitHub search](https://api.github.com/search/repositories?q=%22claude+code+usage%22+created:%3E2026-09-01) |
| **nomnomtokens** | **6 / нед. · 44 / мес. · 0★** | [npm](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) |

2 сент. было ~21.5M Claude vs ~20.4M Codex за неделю. Сейчас Codex впереди, Claude просел примерно вдвое. Причину просадки npm не проверял — это снимок, не диагноз. ccusage / Claude Code ≈ 1.3% на этой неделе (было ~0.4%): знаменатель сжался, не ccusage вырос в разы (84k → 116k).

## Silences

- **Фрилансер и счёт клиенту** — в этом окне снова ни одного first-person. Не строить.
- **Красота дашборда** — никто не жалуется.
- **OTLP receiver** — никто не просит.
- **Синк трекера между машинами как отдельная боль** — запрос `"two computers"` почти пустой. Люди меряют два ноутбука руками и синкают папку. Это обход, не крик.
- **Платить за трекер** — по-прежнему не видно. Звёзды уходят в менюбары.
- Wipe транскриптов в сентябре тише, чем в августе. Доки по-прежнему говорят 30 дней; `doctor` это уже предупреждает.

## Interpretation — моя читалка, не evidence

**Первое.** Защищаемая позиция не сдвинулась: SQLite, три адаптера, история длиннее retention. Сдвинулся вопрос, на который история должна отвечать. Не «какой план» и не «cold или нет», а **сколько процентов недели стоил этот ход и какой моделью**. Снимки лимита и события уже в одной базе. ccusage этот стык не делает — у него нет store.

**Второе.** `reconcile` в сентябре снова громче, чем 2-го. Люди сами пишут аудиты JSONL против метра, потому что официальный `$` и локальный лог врут по-разному. Первый отчёт, который говорит «лог покрывает долю, остальное — injected context, вот слепая зона», попадает в посты, которые уже выходят.

**Третье.** Менюбар не делать, даже несмотря на codenotch. Дистрибуция nnt — одна команда с вердиктом, который человек скринит. Следующий такой вердикт — про единицу лимита, не про название плана.

## Candidate bets

1. **`nnt weigh` — ход в процентах недели** — по своим снимкам лимита и токенам показать, сколько % 7d сдвинул ход / модель (Opus 5.5, Fable, Astra), с error bar. Evidence: theme 1. Risk: единица нестабильна; без честного диапазона это станет ещё одной ложной точностью.
2. **`nnt reconcile`** — лог против последнего снимка метра: какая доля % объясняется событиями, что JSONL не видит. Evidence: theme 2. Risk: без официальной единицы разрыв легко перепутать с багом цен.
3. **Audit: 5‑минутный кэш субагента** — tip, когда sidechain живёт на коротком TTL и длинная команда его переписывает; цена в % лимита, не в $. Evidence: theme 3. Risk: TTL не всегда есть в JSONL; ложный «5m» бьёт по доверию.
4. **Несколько домов в одном отчёте** — сканировать второй `CLAUDE_CONFIG_DIR` / Codex home и показать, у кого остался % и когда ресет. Синк — уже существующий nnt-архив или папка, не облако. Evidence: theme 4. Risk: второй аккаунт без локальных лимитов выглядит как ноль.
5. **Не брать:** менюбар; ещё один долларовый тотал; freelancer billing; OTLP receiver; облачный синк.

**Next:** `/plan nnt weigh` или `/plan nnt reconcile` — скилл `/plan` читает этот файл.

## Appendix — raw evidence

Полосы: [Reddit](977cde4f-9cc7-4251-b29c-c5e0091adc48), [HN](c92d6182-2ebf-4c9e-97bb-aac0b5ac1b9b), [Competitors](0296ba89-8548-4c30-aa46-651c6a6fd037), [Long tail](9603441e-cee2-4e6d-9015-5a33e6956424), [Quant](0f692b0e-dcac-4a89-8c1e-de4be0124a8f). Цитаты тем выше — из этих отчётов, без правок.

| # | Source | Date | URL | Gist |
|---|---|---|---|---|
| 1 | Reddit | 2026-09 | [1wn0xn9](https://www.reddit.com/r/ClaudeCode/comments/1wn0xn9/max20x_is_now_just_15_times_better_than_max5x/) | can't measure 1 unit |
| 2 | Reddit | 2026-09 | [1wjsb04](https://www.reddit.com/r/ClaudeCode/comments/1wjsb04/i_measured_what_prompt_caching_actually_costs/) | meter unit undocumented |
| 3 | Reddit | 2026-09 | [1wonn3t](https://www.reddit.com/r/ClaudeCode/comments/1wonn3t/opus_55_uses_more_weekly_limit/) | Opus 5.5 weekly ≠ session |
| 4 | HN | 2026-09 | [49807336](https://news.ycombinator.com/item?id=49807336) | Astra ~20% weekly, one file |
| 5 | HN | 2026-09 | [49806218](https://news.ycombinator.com/item?id=49806218) | two 5x > one 20x |
| 6 | Reddit | 2026-09 | [1wf1mha](https://www.reddit.com/r/ClaudeCode/comments/1wf1mha/built_with_claude_code_a_local_profiler_for/) | JSONL = ~39% of billed growth |
| 7 | Reddit | 2026-09 | [1w6cy7b](https://www.reddit.com/r/ClaudeCode/comments/1w6cy7b/something_is_wrong_with_usage_and_i_can_prove_it/) | ccusage $110 @ 63% |
| 8 | docs | 2026-09 | [costs](https://code.claude.com/docs/en/costs) | $ / statusline / OTel ≠ bill |
| 9 | GitHub | 2026-09 | [ccusage#1762](https://github.com/ccusage/ccusage/issues/1762) | ~2× token counts |
| 10 | Reddit | 2026-09 | [1wk3zq5](https://www.reddit.com/r/ClaudeCode/comments/1wk3zq5/i_audited_my_session_logs_against_the_usage_meter/) | JSONL vs usage % |
| 11 | Reddit | 2026-09 | [1wkpm2i](https://www.reddit.com/r/ClaudeCode/comments/1wkpm2i/claude_code_subagents_have_a_5m_prompt_cache_long/) | subagent cache 5m |
| 12 | Reddit | 2026-09 | [1wfwf58](https://www.reddit.com/r/ClaudeCode/comments/1wfwf58/limits_drain_and_prompt_cache/) | prompt_cache 1h → 5m |
| 13 | Reddit | 2026-09 | [1wlfofw](https://www.reddit.com/r/ClaudeCode/comments/1wlfofw/cache_miss_cost/) | cache miss $ vs usage unknown |
| 14 | HN | 2026-09 | [49826647](https://news.ycombinator.com/item?id=49826647) | model swap breaks cache |
| 15 | docs | 2026-09 | [sessions](https://code.claude.com/docs/en/sessions) | idle resume = full reprocess |
| 16 | Reddit | 2026-09 | [1whywdz](https://www.reddit.com/r/ClaudeCode/comments/1whywdz/cli_and_terminal_dashboard_for_your_claude_code/) | quota left per seat |
| 17 | Reddit | 2026-09 | [1wg7j5q](https://www.reddit.com/r/ClaudeCode/comments/1wg7j5q/is_there_any_way_to_stop_process_and_clean_up/) | switch before Codex hits |
| 18 | Reddit | 2026-09 | [1wkhzjq](https://www.reddit.com/r/ClaudeCode/comments/1wkhzjq/i_max_both_my_pro_weeklies_every_week_measured/) | 2× Pro, two machines |
| 19 | Reddit | 2026-09 | [1wl9ab4](https://www.reddit.com/r/ClaudeCode/comments/1wl9ab4/is_it_against_anthropic_terms_to_use/) | can't see other machine |
| 20 | GitHub | 2026-09 | [MyUsage](https://github.com/zchan0/MyUsage) | sync folder across Macs |
| 21 | GitHub | 2026-09 | [CodexBar](https://github.com/steipete/CodexBar) | 21855★ |
| 22 | HN | 2026-09 | [49816102](https://news.ycombinator.com/item?id=49816102) | UsageBar Windows tray |
| 23 | GitHub | 2026-09 | [codenotch](https://github.com/vinzdg/codenotch) | 2431★ since Sep 5 |
| 24 | GitHub | 2026-09 | [#96630](https://github.com/anthropics/claude-code/issues/96630) | idle session drains limit |
| 25 | GitHub | 2026-09 | [#92654](https://github.com/anthropics/claude-code/issues/92654) | 0→100% on reset |
| 26 | npm | 2026-09 | [nomnomtokens](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) | 6 downloads |
| 27 | npm | 2026-09 | [@openai/codex](https://api.npmjs.org/downloads/point/last-week/@openai/codex) | 14.7M |
| 28 | npm | 2026-09 | [@anthropic-ai/claude-code](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code) | 8.7M |

**Caveats:** reddit.com 403, тела через Arctic Shift; X — пустой поиск; r/ClaudeAI в окне не сняли (422); звёзды и npm — живые на 2026-09-24; размеры сабреддитов в этот раз не снимались.
