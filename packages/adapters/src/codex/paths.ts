import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Codex stores config, auth, and session rollouts under `CODEX_HOME`
 * (default `~/.codex`). Override via env for tests / alternate installs.
 */
export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex')
}

/** Dated rollout transcripts: `sessions/YYYY/MM/DD/rollout-*.jsonl`. */
export function codexSessionsDir(home = codexHome()): string {
  return join(home, 'sessions')
}
