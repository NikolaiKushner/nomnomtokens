# Working on nomnomtokens

Guidance for AI agents (and humans) contributing to this repo.

## Change flow: commit to `main`

This is a solo project. Work lands on `main` directly — no feature branches and
no PRs for ordinary work. Commit, push, done.

Branch and open a PR only when a change genuinely wants a second look before it
ships. Then merge it yourself; no approval is required and none should be
waited for.

## Commit messages are load-bearing

release-please decides the next version by reading commit messages on `main`.
While work went through squash-merged PRs, the PR title carried that meaning.
It doesn't any more — **the commit message is the release trigger**, so every
commit that lands on `main` needs a conventional-commit subject:

```
feat: show time until rate-limit reset in the statusline   → minor
fix(cli): statusline crashes when resets_at is missing      → patch
docs: explain the dedup key                                 → no release
feat!: drop the v1 database schema                          → major
```

A non-conventional subject silently produces no release, which is the failure
you notice a week later when npm is still on the old version.

## Releasing

release-please watches `main` and opens a release PR that bumps the version and
writes `CHANGELOG.md`. **Merging that PR is what publishes to npm.** It is the
one PR worth keeping — it isn't ceremony, it's the publish button.

## Verification

Run these before pushing to `main`; together they take well under a minute:

```
pnpm -r typecheck
pnpm -r test
```

CI (`.github/workflows/ci.yml`) runs the same two, then builds the dashboard and
CLI bundle, packs the tarball, and installs it into a clean project on
ubuntu/macos × Node 22/24. That smoke job is the only test that exercises what
users actually download — it once caught a bundle that resolved fine from the
workspace and not at all when published. Nothing blocks a push; if CI goes red,
fix forward with another commit.

To eyeball the status line without waiting for a release:

```
echo '{"cost":{"total_cost_usd":4.2},"rate_limits":{"five_hour":{"used_percentage":73,"resets_at":9999999999}}}' \
  | pnpm --silent nnt statusline --dry-run
```

## Project notes

- **pnpm is the package manager**, Node 22+. Monorepo: `packages/{core,db,adapters,cli}`
  plus the Nuxt dashboard in `apps/web`.
- Timestamps are **unix ms everywhere** past the adapter boundary. Provider
  payloads (Claude Code, Codex) send unix *seconds* — convert at the parse site
  and say so in a comment.
- Limits (`rate_limits.five_hour` / `seven_day`) reach us only through the
  statusline hook; they appear nowhere in the transcript. That is why the hook
  exists and why it must never throw — an exception there puts a stack trace in
  the user's status bar on every render.
- The statusline hook must stay fast and silent: render first, persist second,
  and swallow store errors.
