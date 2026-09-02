import { cacheHitRate } from './aggregate.js'
import type { ColdResume } from './cold-resume.js'

/** Input slices gathered by the db/API layer — pure, no I/O. */
export interface AuditInput {
  range: { from: number, to: number }
  totals: {
    costUsd: number
    tokens: number
    events: number
    qtyIn: number
    qtyCacheRead: number
  }
  sidechain: {
    taggedEvents: number
    costUsd: number
    tokens: number
  }
  models: Array<{ unitLabel: string | null, costUsd: number }>
  sessions: Array<{
    sessionId: string
    label: string | null
    costUsd: number
    sidechainCostUsd: number
    sidechainTagged: number
  }>
  /** Cap model rows in the report (default 5). */
  modelLimit?: number
  /** Cap session rows (default 5). */
  sessionLimit?: number
  /** Precomputed cold-resume hits for sessions in range. */
  coldResumes?: ColdResume[]
}

export interface AuditReport {
  range: { from: number, to: number }
  totals: { costUsd: number, tokens: number, events: number }
  cache: { hitRate: number | null, readTokens: number, freshInTokens: number }
  sidechain: {
    /** false when no event in range carries meta.sidechain */
    tagged: boolean
    costUsd: number
    tokens: number
    shareOfCost: number | null
  }
  models: Array<{ unitLabel: string | null, costUsd: number, share: number }>
  topSessions: Array<{
    sessionId: string
    label: string | null
    costUsd: number
    sidechainShare: number | null
  }>
  coldResumes: ColdResume[]
  tips: string[]
}

function share(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return part / whole
}

function isFrontierModel(label: string | null): boolean {
  if (!label) return false
  const l = label.toLowerCase()
  return l.includes('fable') || l.includes('opus')
}

/**
 * Build an audit report and up to three actionable tips from pre-aggregated
 * slices. Tips stay conservative: high thresholds, English, no medical-tone.
 */
export function buildAuditReport(input: AuditInput): AuditReport {
  const modelLimit = input.modelLimit ?? 5
  const sessionLimit = input.sessionLimit ?? 5
  const totalCost = input.totals.costUsd
  const tagged = input.sidechain.taggedEvents > 0

  const models = [...input.models]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, modelLimit)
    .map(m => ({
      unitLabel: m.unitLabel,
      costUsd: m.costUsd,
      share: share(m.costUsd, totalCost) ?? 0,
    }))

  const topSessions = input.sessions.slice(0, sessionLimit).map(s => ({
    sessionId: s.sessionId,
    label: s.label,
    costUsd: s.costUsd,
    sidechainShare: s.sidechainTagged > 0
      ? share(s.sidechainCostUsd, s.costUsd)
      : null,
  }))

  const hitRate = cacheHitRate({
    cacheRead: input.totals.qtyCacheRead,
    in: input.totals.qtyIn,
  })

  const sidechainShare = tagged ? share(input.sidechain.costUsd, totalCost) : null

  const report: AuditReport = {
    range: input.range,
    totals: {
      costUsd: input.totals.costUsd,
      tokens: input.totals.tokens,
      events: input.totals.events,
    },
    cache: {
      hitRate,
      readTokens: input.totals.qtyCacheRead,
      freshInTokens: input.totals.qtyIn,
    },
    sidechain: {
      tagged,
      costUsd: input.sidechain.costUsd,
      tokens: input.sidechain.tokens,
      shareOfCost: sidechainShare,
    },
    models,
    topSessions,
    coldResumes: (input.coldResumes ?? []).slice(0, sessionLimit),
    tips: [],
  }

  report.tips = buildTips(report)
  return report
}

function formatGap(ms: number): string {
  const hours = Math.round(ms / 3_600_000)
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`
  return `${hours}h`
}

function buildTips(report: AuditReport): string[] {
  const tips: string[] = []

  const cold = report.coldResumes[0]
  if (cold) {
    const name = cold.label ?? cold.sessionId.slice(0, 12)
    const dollars = cold.costUsd < 0.01 ? `$${cold.costUsd.toFixed(4)}` : `$${cold.costUsd.toFixed(2)}`
    tips.push(
      `Session ${name} went cold after ${formatGap(cold.gapMs)}; the next turn cost ${dollars} in cache writes — /clear is cheaper than resume.`,
    )
  }

  if (
    report.sidechain.tagged
    && report.sidechain.shareOfCost !== null
    && report.sidechain.shareOfCost >= 0.3
  ) {
    const pct = Math.round(report.sidechain.shareOfCost * 100)
    tips.push(
      `Subagents are ${pct}% of cost in this range — set CLAUDE_CODE_SUBAGENT_MODEL to sonnet or haiku so Task-tool workers stop inheriting the frontier model.`,
    )
  }

  if (
    report.cache.hitRate !== null
    && report.cache.hitRate >= 0.85
    && report.cache.readTokens > report.cache.freshInTokens
  ) {
    tips.push(
      `Cache reads are ${Math.round(report.cache.hitRate * 100)}% of input tokens — they inflate the token count more than the dollar bill; watch cost, not raw tokens, when pacing limits.`,
    )
  }

  const top = report.models[0]
  if (
    top
    && isFrontierModel(top.unitLabel)
    && top.share >= 0.5
    && report.totals.costUsd > 0
  ) {
    const name = top.unitLabel ?? 'frontier'
    tips.push(
      `${name} is ${Math.round(top.share * 100)}% of spend — reserve it for hard tasks and default the rest to a cheaper model.`,
    )
  }

  return tips.slice(0, 3)
}
