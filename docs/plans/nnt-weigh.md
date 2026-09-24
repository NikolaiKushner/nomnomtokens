# Plan: `nnt weigh` — ход в процентах недели

**Date:** 2026-09-24 · **Branch:** `main` · **Status:** done
**Source:** [brainstorm-what-to-build-next-2026-09-24.md](../research/brainstorm-what-to-build-next-2026-09-24.md) bet 1

## Problem

Соло на Claude Max видит процент 7d и не может сказать, сколько этого процента стоил ход и какая модель двигает неделю быстрее. Единицу метра Anthropic не публикует ([1wn0xn9](https://www.reddit.com/r/ClaudeCode/comments/1wn0xn9/max20x_is_now_just_15_times_better_than_max5x/), [1wjsb04](https://www.reddit.com/r/ClaudeCode/comments/1wjsb04/i_measured_what_prompt_caching_actually_costs/)).

## Outcome

`nnt weigh` печатает по текущему 7d-окну Claude: сколько процентных пунктов недели пришлось на $1 list price у каждой модели, с диапазоном, и прямо говорит, когда чистых замеров нет.

## Success criteria

- [x] На синтетике из 4 чистых интервалов (одна модель ≥80% cost) медиана pp/$ совпадает с ручным счётом, p25–p75 не пустые
- [x] Смешанный интервал (<80% одной модели) не входит в пер-модельную медиану и входит в blended
- [x] Сброс окна (usedPct упал) не создаёт отрицательный вес
- [x] Меньше 3 чистых интервалов по модели → строка `unknown`, не выдуманная цифра
- [x] `nnt weigh --json` и текст расходятся не больше, чем `verdict` (один объект `WeighReport`)
- [x] `pnpm -r typecheck` и `pnpm -r test` зелёные

## Non-goals

- Не объяснять остаток «метр ушёл, лога нет» — это `nnt reconcile`
- Не взвешивать 5h, Codex, Cursor: у них другая единица, в v1 только `claude-code` / `7d`
- Не писать вес в базу и не обновлять `prices.json`
- Не отдельная страница. Overview не трогаем в этом плане
- Не менюбар, не мульти-аккаунт

## Context found in the codebase

Образец — `nnt verdict`: чистая функция `buildVerdict` в `packages/core/src/verdict.ts`, снимок лимитов через `Queries.limitSnapshots`, CLI `packages/cli/src/commands/verdict.ts`, регистрация в `packages/cli/src/index.ts`. Прогноз окна уже режет сброс: `currentWindowSnapshots` в `packages/core/src/forecast.ts`. Стоимость по модели за интервал уже умеет `Queries.byUnitLabel` + `Filters` (`from`/`to`/`provider`) в `packages/db/src/queries.ts`. Цены — list price, `null` не является нулём (`docs/architecture.md`). Коммиты на `main`, проверка `pnpm -r typecheck` и `pnpm -r test`.

## Design

**Chosen: чистые интервалы.** Между соседними снимками текущего 7d-окна, где usedPct вырос, суммируем list-price cost по `unitLabel`. Интервал «чистый», если одна модель ≥80% cost и cost > 0. По чистым интервалам модели — медиана, p25 и p75 пунктов процента на $1. Все растущие интервалы с cost > 0 дают один blended вес. Меньше 3 чистых интервалов — `unknown`.

**Why over the alternatives:**

| Approach | How | Trade-off | Verdict |
|---|---|---|---|
| A (chosen) | только интервалы с ≥80% одной модели | мало замеров на смешанном дне | **ship** — не врём точностью |
| B | делить deltaPct пропорционально cost | цифра всегда есть | rejected: смешанный час приписывает чужой кэш дорогой модели |
| C | вес = deltaPct / tokens, без $ | не зависит от прайса | rejected: люди сравнивают модели в деньгах лимита; токены Opus и Haiku не одна единица |

**What would change this decision:** если на реальном сторе чистых интервалов стабильно <3 за неделю — тогда B, но диапазон шире и подпись «proportional, mixed». Это не блокер v1: честный `unknown` уже ответ.

**Touches:** core (`weigh.ts`) · db (без миграции, читаем `limits` + `events`) · CLI · deps нет.

Допущение: 80% и порог 3 интервала зашиты константами рядом с функцией, не в конфиг.

## Steps

### 1. Чистая функция и тесты на грязных интервалах — M · `[x]`

- **Why first:** если порог 80% не отделяет модели, CLI и SQL нечего обвязывать
- **Files:** `packages/core/src/weigh.ts` (new), `packages/core/src/weigh.test.ts` (new), `packages/core/src/index.ts` (export)
- **Does:** `buildWeigh(intervals)` → `{ window, blended, models[], samples, caveats }`. Модель: `{ unitLabel, ppPerUsd: { median, p25, p75 } | null, cleanIntervals, status: 'ok' | 'unknown' }`. Кейсы: 4 чистых, один смешанный, сброс usedPct, 2 интервала → unknown, cost 0 → интервал выкинут, `null` cost не считается нулём
- **Verify:** `pnpm --filter @nomnomtokens/core test -- weigh`
- **Depends on:** —

### 2. Собрать интервалы из стора — S · `[x]`

- **Why first:** второй риск — снимок и события не стыкуются по ts
- **Files:** `packages/db/src/queries.ts` (`limitSnapshots`, `byUnitLabel` — переиспользовать, не новый SQL, если фильтр `from`/`to` уже режет), `packages/db/src/db.test.ts` (один кейс: два снимка, два события разных моделей внутри щели)
- **Does:** хелпер рядом с verdict-сборкой (в CLI-шаге или тонкая функция в db, если так короче): `currentWindowSnapshots` по 7d `claude-code`, для каждой пары с ростом usedPct — `byUnitLabel({ from, to, provider: ['claude-code'], kind: 'tokens' })`. ts снимка включительно в следующий интервал не дублировать
- **Verify:** `pnpm --filter @nomnomtokens/db test` — дельта % и две модели на месте, событие ровно на ts границы не попадает в оба интервала
- **Depends on:** 1 (тип интервала)

### 3. `nnt weigh` — S · `[x]`

- **Files:** `packages/cli/src/commands/weigh.ts` (new), `packages/cli/src/index.ts` (command `weigh`), README-таблица команд одной строкой
- **Does:** как `verdictCommand`: открыть db, собрать интервалы, `buildWeigh`, `--json` или текст. Пустой стор — те же caveats, модели пустые, exit 0. В тексте у `unknown` нет числа, есть «need 3 clean gaps»
- **Verify:** `pnpm --filter @nomnomtokens/cli test`, если у verdict нет CLI-теста — хотя бы `pnpm -r typecheck`; ручной прогон на фикстуре не обязателен, db-тест из шага 2 покрывает стык
- **Depends on:** 1, 2

## Risks

| Risk | Early signal | Cheapest way to resolve it now |
|---|---|---|
| Реальные щели почти всегда смешанные | шаг 1 легко зелёный, на живом сторе везде `unknown` | после шага 3 один прогон `nnt weigh` на своей базе; если все `unknown` — не менять формулу втихую, решить B отдельно |
| Другая машина сидит в том же % | вес завышен | caveat в отчёте, как у verdict: this machine only. Не лечить в v1 |
| List price устарел | pp/$ плывёт вместе с прайсом | не нормализовать задним числом; подпись «list price in the store now» |

## Rollback

Миграции нет. Откат — удалить команду и `weigh.ts`. Стор не меняется.

## Test plan

- Unit: `weigh.test.ts` (шаг 1), один db-тест на границы интервала (шаг 2)
- CI: `pnpm -r typecheck`, `pnpm -r test` — как в CLAUDE.md
- Нарочно не тестируем UI, Codex, 5h, совпадение с официальным биллингом

## Rollout

Без флага. Коммит `feat: weigh weekly limit points per list-price dollar` на `main`. Сработало, если `nnt weigh --json` на сторе со statusline-снимками печатает `samples` > 0 и не бросает.

## Open questions

- Нет. Порог 80% и минимум 3 интервала — допущение в Design, не блокер.

## Deferred / out of scope

- Overview-карточка рядом с Verdict
- Пропорциональное размазывание смешанных интервалов (подход B)
- `nnt reconcile`, TTL субагента, второй `CLAUDE_CONFIG_DIR`
