import type { IngestRecord } from '@nomnomtokens/core'
import { parseStatusline, type StatuslinePayload } from '@nomnomtokens/adapters'

/**
 * Ingest endpoint.
 *
 * Accepts either raw IngestRecords (what an out-of-process adapter sends) or a
 * Claude Code statusline payload (so the hook can post here instead of opening
 * its own database handle). This is the seam phase 2's `nnt sync` and the OTLP
 * receiver plug into — same contract, different transport.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody<
    { records?: IngestRecord[] } | { statusline?: StatuslinePayload } | StatuslinePayload
  >(event)

  let records: IngestRecord[] = []

  if (body && typeof body === 'object' && 'records' in body && Array.isArray(body.records)) {
    records = body.records
  } else if (body && typeof body === 'object' && 'statusline' in body && body.statusline) {
    records = await parseStatusline(body.statusline)
  } else if (body && typeof body === 'object' && 'session_id' in body) {
    records = await parseStatusline(body as StatuslinePayload)
  } else {
    throw createError({ statusCode: 400, statusMessage: 'expected { records } or a statusline payload' })
  }

  const result = repo().ingest(records)
  notifyIngest()
  return result
})
