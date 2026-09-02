# Brainstorm: что улучшать в nomnomtokens после audit

**Date:** 2026-09-02 · **Decision:** какие 1–3 ставки взять после `nnt audit` (план [nnt-audit.md](../plans/nnt-audit.md) — done)
**Audience:** соло на Claude Pro/Max; люди, которые жонглируют Claude + Codex + Cursor из‑за лимитов; (вторично) тимлиды с AI-бюджетом
**Researcher:** Cursor Grok (`/brainstorm`), 5 параллельных полос · поверх [2026-08-21](./brainstorm-what-to-improve-2026-08-21.md) и [2026-08-10](./brainstorm-what-to-build-next-2026-08-10.md)

---

## TL;DR

- Самый громкий новый вопрос: **«20x» — это 5‑часовой множитель, не 4× недельного пула.** Люди даунгрейдят, считают два Max 5x выгоднее одного 20x и сами разносят это в Reddit/HN.
- Рычаг «куда ушло» сузился до **холодного resume**: 95% «почему сгорело» — истёкший prompt cache, а не абстрактный cache %. `nnt audit` v1 это ещё не говорит.
- Слой «покажи % в хроме» **закрыт CodexBar (~20.8k★)** и волной менюбаров/виджетов. Ещё один meter не взлетит.
- Codex по npm почти догнал Claude Code (**20.4M vs 21.5M / нед.**). Мульти-харнесс — норма, не ниша.
- nomnomtokens: **17 npm/нед., 1★, последний публичный пуш 10 авг.** Категория живая; мы в ней почти невидимы.

---

## Coverage

| Lane | Where I looked | Items found | Confidence |
|---|---|---|---|
| Reddit | r/ClaudeCode, r/ClaudeAI, r/cursor (Arctic Shift; reddit.com 403) | 25 | medium |
| HN + X | Algolia 2026-08-21→09-02; X login-walled (403) | 25 HN / 0 X | high HN, **low X** |
| Competitors | GitHub/npm/docs: ccusage, ccstatusline, CodexBar, brink, headroom, `/usage` | 25 | high |
| Long tail | Anthropic docs, Cursor forum, ccusage-hub, transcript retention | 25 | high |
| Quant | npm last-week/month, GitHub stars, PH Diet Claude | 25 | high |
| Gaps | X verbatim, YouTube comments, Reddit first-party JSON, G2/Trustpilot | — | — |

---

## Themes, ranked

### 1. «20x» не даёт 4× недели — `Pain` + `Desire` · F5 I5 R5 = **15**

С конца августа это уже не «нужен ли мне Max», а **конкретный обман ожиданий**: 20x множит 5‑часовое окно; недельный кап растёт слабо. Люди отменяют план в день, как узнали. Два аккаунта 5x > один 20x — revealed behaviour, не гипотеза.

> "I downgraded from the 20x today after learning that 20x only applies to 5 hour usage." — [HN, 2026-09](https://news.ycombinator.com/item?id=49528806)
> "This means 2 $100 plans provides more usage than 1 $200 plan." — [HN, 2026-08](https://news.ycombinator.com/item?id=49511477)
> "It's 20x the 5h session limit, not 20x the weekly limit." — [r/ClaudeAI, 2026-08](https://www.reddit.com/r/ClaudeAI/comments/1vx0k69/)
> "better to get 2 accounts because then you actually get more usage whereas 20x is a scam" — [r/ClaudeAI, 2026-08](https://www.reddit.com/r/ClaudeAI/comments/1vyrh6k/)
> "how 80% of weekly limit be gone in less than 6 hours into the week?" — [r/ClaudeCode, 2026-09](https://www.reddit.com/r/ClaudeCode/comments/1w57pu1/its_been_6hours_since_the_weekly_limit_reset_and/)

**So what:** ставка `nnt verdict` из августа стала громче и конкретнее. Формат, который люди **сами постяют**. Это дистрибуция, не ров.

### 2. Стена — недельный кап + Fable/субагенты, не 5h — `Pain` · F5 I4 R4 = **13**

Weekly — «всегда проблема»; 5h редко. Fable оркестратор сжигает бар за минуты; дефолтный Fable-on-Fable fan-out (8–100 агентов) — известный антипаттерн. Новые обходы: Fable оркестрирует **Codex/Sol воркеров**, чтобы растянуть Fable-бюджет.

> "Weekly is always the issue, I rarely ever run into 5 hour limits." — [r/ClaudeAI, 2026-08](https://www.reddit.com/r/ClaudeAI/comments/1w363of/)
> "Fable eats quota in minutes, even with reasonably small context (< 100k)" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1w0xie5/fable_supposedly_uses_roughly_2x_as_much_usage_as/)
> "it will deploy 8 (in my case) Fable subagents on trivial tasks and destroy your usage instantly." — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vvi3h6/friendly_lesson_explicitly_tell_fable_to_not/)
> "It dispatched five Fable subagents." — [HN tare, 2026-08](https://news.ycombinator.com/item?id=49468971)

**So what:** `nnt audit` уже режет sidechain/model mix. Дырка — **недельный-first pacing** и кросс-агентный «Fable 10%, Codex ещё жив». Текущий statusline рисует 5h и 7d рядом, без приоритета и без второго харнесса.

### 3. Холодный resume — главный «почему сгорело» — `Pain` · F5 I5 R4 = **14**

Не «много cache reads» (это норма и дёшево), а **промах по TTL**: resume сессии старше ~1 часа / после expiry кэша = один промпт жрёт бар. На Show HN tare (88 pts, прямой конкурент audit) топ-ответ: 95% случаев — expired cache. Anthropic сам добавил в `/usage` строку `Prompt cache (main): warm/cold` (v2.1.251).

> "In 95% of cases it is because you had a large context for which the cache expired." — [HN, 2026-08](https://news.ycombinator.com/item?id=49469071)
> "the single biggest mistake that most people make is resuming a session that is older than 1 hour" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vzo850/for_everyone_burning_their_usage_limits_with_a/)
> "Resuming a conversation after it becomes uncached is a massive usage limit killer." — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vyff2x/)
> "So the \"why\" is still a question left for the user to answer." — [HN tare, 2026-08](https://news.ycombinator.com/item?id=49468846)

**So what:** audit v1 считает cache hit rate и советует «смотри на $, не на токены» — это **не** тот рычаг. Нужен causal tip: «эта сессия остыла, следующий ход стоил X; /clear дешевле resume».

### 4. Квота должна быть в хроме всегда — `Desire` · F5 I4 R3 = **12**

CodexBar (~20.8k★, пуш сегодня) стал де-факто стандартом «все лимиты в менюбаре». За две недели: brink (Claude+Codex+Cursor + per-project, 52★ за 3 дня), Ration, pixel pet, Windows-виджеты, платный LimitBar. На tare люди просят «graphically display quota on the screen at all times» и ставят хук «стоп на 80%».

> "Every AI coding limit, in your menu bar." — [CodexBar](https://github.com/steipete/CodexBar)
> "I just wanted to know exactly where my limits were at, all the time, without opening anything" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vxhu5b/built_a_taskbar_app_for_my_claude_and_codex_usage/)
> "It would be cool if these harnesses could all graphically display your quota usage on the screen at all times." — [HN, 2026-08](https://news.ycombinator.com/item?id=49468960)
> "My deepseek harness plugin auto stops asking things when I am at 80%" — [HN, 2026-08](https://news.ycombinator.com/item?id=49469642)

**So what:** **не** строить macOS menu bar. Statusline nnt уже есть, но Claude-only. Выигрыш — **pace + cross-agent headroom из нашего store**, не хром.

### 5. История сидит на данных, которые вендор стирает — `Pain` · F4 I4 R4 = **12**

`/usage` официально this-machine-only. Транскрипты по умолчанию 30 дней; реальные репорты — исчезновение за ~9 дней и silent wipe по mtime. ccusage-hub и «два компьютера в одном ccusage» — обходы лидера, который год не закрывает мульти-машину.

> "computed from local session history on this machine, so usage from other devices or claude.ai is not included." — [Anthropic docs, 2026-09](https://code.claude.com/docs/en/costs)
> "the oldest surviving session transcript in the project folder is dated 2026-08-19 — exactly 9 days old" — [anthropics/claude-code#90371, 2026-08](https://github.com/anthropics/claude-code/issues/90371)
> "`ccusage` only reads local files, so by design it can't see usage spread across your laptop, desktop, and servers." — [ccusage-hub, 2026-05](https://github.com/CingyQ/ccusage-hub)
> "Numbers are from ccusage across two machines (laptop + a VM), so this is everything on the account" — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1vupp1z/1_of_the_weekly_limit_costs_me_about_29_heres_the/)

**So what:** SQLite — единственный структурный клин, который CLI без стора не скопирует за вечер. Сканер читает JSONL; **не архивирует** его до cleanup.

### 6. Цифрам по-прежнему не верят — `Objection` · F4 I4 R4 = **12**

За окно Aug 21–Sep 2 **не нашли** новых тредов «ccusage врёт» (silence). Недоверие ушло **на вендора**: Fable multiplier на сабе ≠ 2× API; `/usage`/statusline/OTel «don't match your bill»; ccusage/ccstatusline всё ещё чинят overcount (1.84×, fork replay 36×, Codex historical reprice).

> "the figures in `/usage`, the status line, and OpenTelemetry don't match your bill" — [Anthropic docs, 2026-09](https://code.claude.com/docs/en/costs)
> "It's 2x on API pricing. The multiplier on the subscription plan is definitely more." — [r/ClaudeCode, 2026-08](https://www.reddit.com/r/ClaudeCode/comments/1w0xie5/)
> "Token widgets over-report ~1.84x: one JSONL entry per content block is counted per API call" — [ccstatusline#549, 2026-08](https://github.com/sirmalloc/ccstatusline/issues/549)

**So what:** `nnt reconcile` всё ещё свободная ниша, но **тише**, чем в августе. Люди сейчас злятся на маркетинг 20x, не на трекеры.

---

## Competitive landscape (снимок 2026-09-02)

| Product | Who it's for | Pricing | Strength | Loudest complaint |
|---|---|---|---|---|
| **CodexBar** | все лимиты в менюбаре | OSS | **20.8k★**, пуш сегодня | undercount, multi-account quirks |
| ccusage | CLI totals, много адаптеров | OSS | 18.3k★ · **85k/wk npm** | historical reprice, fork double-count |
| ccstatusline | красивый statusline | OSS | 12.7k★ · 21k/wk | ~1.84× overcount; stale vs `/usage` |
| Claude `/usage` | встроенный разбор | bundled | attribution, cache warm/cold, spend_limit | this-machine; $ ≠ bill |
| tare / kelviq | «почему сгорело за 10 мин» | OSS | Show HN **88 pts** (5 дней назад) | where ≠ why; нет per-repo |
| brink | Claude+Codex+Cursor + project | OSS | **52★ за 3 дня** (с 29 авг) | новый, тонкий сигнал |
| headroom | multi-account rotate | OSS | 100★ | macOS re-login |
| Diet Claude | Chrome extension usage | — | PH **#2, 401 upvote** 25 авг | хром, не история |
| **nomnomtokens** | local dashboard + history | OSS | **1★ · 17/wk · last push 10 авг** | рынок нас не знает |

Новые Show HN за окно: tare/kelviq, Wattage (waste profiler), Ration (menu bar), AgentObs. Старые TokenMaxxer/Tokimeter/Pacer — **0 новых комментариев**. Слой «ещё один счётчик» мёртв для запуска; слой «почему / всегда видно / несколько агентов» жив.

---

## Quant signals

| What | Number | Source |
|---|---|---|
| Claude Code CLI | 21,450,823 / нед. | [npm last-week](https://api.npmjs.org/downloads/point/last-week/@anthropic-ai/claude-code) |
| Codex CLI | 20,368,373 / нед. | [npm last-week](https://api.npmjs.org/downloads/point/last-week/@openai/codex) |
| ccusage | 84,583 / нед. · 18,293★ | [npm](https://api.npmjs.org/downloads/point/last-week/ccusage) / GitHub |
| ccstatusline | 20,658 / нед. · 12,716★ | npm / GitHub |
| **nomnomtokens** | **17 / нед. · 784 / мес. · 1★** | [npm last-week](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) · [GitHub](https://github.com/NikolaiKushner/nomnomtokens) |
| CodexBar | 20,831★ | GitHub API 2026-09-02 |
| Новые репо `claude code usage` после 2026-08-01 | **766** | GitHub search |
| r/ClaudeAI · r/ClaudeCode · r/cursor | ~1.11M · 401k · 154k | reddtrends / gummysearch (оценки) |

С 21 авг: ccusage 102k→85k/нед. (не взрыв, плато); nnt 40→17/нед. (послеспайковая нормализация, не рост). Конверсия Claude Code → ccusage ≈ 0.4%. Codex CLI по скачиваниям почти равен Claude — мульти-агентный positioning больше не «опережает рынок».

---

## Silences & contradictions

- **Фрилансер биллит клиента за токены** — снова ноль first-person. Не строить.
- **«ccusage неточный»** как поисковая фраза в этом окне — нет хитов. Недоверие сместилось на Anthropic, не на трекеры.
- **Cursor «убрали $»** — частично отыграно: Cost column вернули ([forum](https://forum.cursor.com/t/usage-page-to-token-amount-what/167153?page=3)); люди всё ещё качают CSV, чтобы сложить период. Tailwind слабее, чем 10 авг.
- **Визуал трекеров** — никто не жалуется, что «некрасиво».
- **OTLP receiver** — по-прежнему никто не просит; Grafana/OTel — свой стек.
- Reddit/HN skew technical и complaint-heavy; это весь пул. Платить за трекер по-прежнему **не видно** (кроме LimitBar €3.46).

Противоречие: `/usage` теперь показывает skills/subagents/cache warm-cold — кусок audit-ниши вендор закрывает сам. Защищаемое — **история длиннее retention, несколько харнессов в одном store, вердикт по твоим окнам**.

---

## Interpretation — my read, not evidence

**Первое.** Слой «покажи число» проигран ещё жёстче: CodexBar забрал хром, ccusage — CLI, `/usage` — «куда ушло сегодня». Защищаемая позиция nnt не меняется: **SQLite-история + поведение во времени + три адаптера**. Audit v1 это подтверждает, но не продаёт.

**Второе.** Самая дешёвая дистрибуция сейчас — `nnt verdict` в формулировке августа, но с новой конкретикой: «20x ≠ 4× недели; вот твои 5h vs 7d окна; два 5x vs один 20x на *твоих* данных». Это единственное, что люди сами скринят в Reddit.

**Третье.** Не делать менюбар. Не углублять audit как ещё одну таблицу долей. Следующий мм audit — **холодный resume**. Statusline — weekly-first и «Codex ещё жив», из уже лежащих лимитов.

---

## Candidate bets

1. **`nnt verdict`** — один отчёт: сидишь ли ты в Pro / Max 5x / Max 20x по *недельному* капу, а не по имени плана; «два 5x vs один 20x» на твоих окнах. Evidence: theme 1. Risk: тарифные множители вендор не документирует стабильно — вердикт должен носить error bars.
2. **Audit v2: cold resume** — детект сессий, где большой cache write после idle > TTL; tip «/clear дешевле, чем resume». Evidence: theme 3. Risk: TTL не всегда виден в JSONL; ложные «cold» подрывают trust.
3. **Statusline: weekly-first + Codex headroom** — 7d важнее 5h; если Claude у стены, а в store есть свежий Codex лимит — сказать переключиться. Evidence: themes 2, 4. Risk: Cursor без локальных токенов; хук Claude не видит Codex payload — только наш SQLite.
4. **Архив до wipe + merge с другой машины** — scan складывает события в store (уже так) + явный `nnt import-store` / предупреждение `doctor`, что JSONL умрёт через N дней. Evidence: theme 5. Risk: privacy-контракт (ничего не уезжает) усложняет «sync»; начать с файла, не с облака.
5. **Не брать:** менюбар-клон CodexBar; `nnt reconcile` как *первую* ставку (тише, чем в авг.); freelancer billing; OTLP receiver; отдельную /audit страницу.

**Next:** `/plan nnt verdict` или `/plan audit-v2-cold-resume` — скилл `/plan` читает этот файл.

---

## Appendix — raw evidence

| # | Source | Date | URL | Quote gist |
|---|---|---|---|---|
| 1 | HN | 2026-09 | [49528806](https://news.ycombinator.com/item?id=49528806) | downgraded 20x: only 5h |
| 2 | HN | 2026-08 | [49511477](https://news.ycombinator.com/item?id=49511477) | two $100 > one $200 |
| 3 | HN | 2026-08 | [49509882](https://news.ycombinator.com/item?id=49509882) | thought 20x = 4× 5x weekly |
| 4 | Reddit | 2026-08 | [r/ClaudeAI 1vx0k69](https://www.reddit.com/r/ClaudeAI/comments/1vx0k69/) | 20x = 5h, not weekly |
| 5 | Reddit | 2026-09 | [r/ClaudeCode 1w57pu1](https://www.reddit.com/r/ClaudeCode/comments/1w57pu1/its_been_6hours_since_the_weekly_limit_reset_and/) | 80% weekly gone in <6h |
| 6 | Reddit | 2026-08 | [r/ClaudeAI 1w363of](https://www.reddit.com/r/ClaudeAI/comments/1w363of/) | weekly always the issue |
| 7 | Reddit | 2026-08 | [1w0xie5](https://www.reddit.com/r/ClaudeCode/comments/1w0xie5/fable_supposedly_uses_roughly_2x_as_much_usage_as/) | Fable eats quota in minutes |
| 8 | Reddit | 2026-08 | [1vvi3h6](https://www.reddit.com/r/ClaudeCode/comments/1vvi3h6/friendly_lesson_explicitly_tell_fable_to_not/) | 8 Fable subagents on trivia |
| 9 | HN | 2026-08 | [49469071](https://news.ycombinator.com/item?id=49469071) | 95% = expired cache |
| 10 | Reddit | 2026-08 | [1vzo850](https://www.reddit.com/r/ClaudeCode/comments/1vzo850/for_everyone_burning_their_usage_limits_with_a/) | don't resume >1h session |
| 11 | HN | 2026-08 | [49467551](https://news.ycombinator.com/item?id=49467551) | tare Show HN 88 pts |
| 12 | HN | 2026-08 | [49468846](https://news.ycombinator.com/item?id=49468846) | where ≠ why |
| 13 | GitHub | 2026-09 | [steipete/CodexBar](https://github.com/steipete/CodexBar) | 20.8k★ menu bar |
| 14 | Reddit | 2026-08 | [1vxhu5b](https://www.reddit.com/r/ClaudeCode/comments/1vxhu5b/built_a_taskbar_app_for_my_claude_and_codex_usage/) | Claude+Codex taskbar |
| 15 | Anthropic | 2026-09 | [costs](https://code.claude.com/docs/en/costs) | this-machine; $ ≠ bill |
| 16 | GitHub | 2026-08 | [claude-code#90371](https://github.com/anthropics/claude-code/issues/90371) | transcripts gone in 9 days |
| 17 | GitHub | 2026-05 | [ccusage-hub](https://github.com/CingyQ/ccusage-hub) | multi-machine hole |
| 18 | npm | 2026-08 | [nomnomtokens last-week](https://api.npmjs.org/downloads/point/last-week/nomnomtokens) | 17 downloads |
| 19 | npm | 2026-08 | [ccusage last-week](https://api.npmjs.org/downloads/point/last-week/ccusage) | 84,583 |
| 20 | npm | 2026-08 | [@openai/codex last-week](https://api.npmjs.org/downloads/point/last-week/@openai/codex) | 20.4M |
| 21 | GitHub | 2026-08 | [semihtalii/brink](https://github.com/semihtalii/brink) | new multi-agent + project |
| 22 | GitHub | 2026-08 | [ccstatusline#549](https://github.com/sirmalloc/ccstatusline/issues/549) | 1.84× over-report |
| 23 | Cursor forum | 2026-08 | [usage $ restored](https://forum.cursor.com/t/usage-page-to-token-amount-what/167153?page=3) | Cost column back |
| 24 | Product Hunt | 2026-08 | [Diet Claude](https://hunted.space/product/diet-claude) | #2, 401 upvotes |
| 25 | HN | 2026-08 | [49469642](https://news.ycombinator.com/item?id=49469642) | stop asking at 80% |

**Caveats:** reddit.com 403 — тексты через Arctic Shift, ссылки канонические; X 403, цитаты твитов только из HN; звёзды CodexBar с GitHub API в полосе Competitors (прямой fetch github.com timeout); размеры сабреддитов — third-party estimates.
