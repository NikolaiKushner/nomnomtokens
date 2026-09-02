import { importCsv } from '@nomnomtokens/adapters'
import { looksLikeNntArchive, parseNntArchive } from '@nomnomtokens/core'
import { loadPriceTable } from '@nomnomtokens/db'

/**
 * Upload a CSV (billing export) or an nnt archive JSON into the local store.
 * Body: raw text, or multipart field `file` / `csv`.
 */
export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, 'content-type') ?? ''
  let text = ''
  let provider: string | undefined
  let kind: string | undefined

  if (contentType.includes('multipart/form-data')) {
    const form = await readMultipartFormData(event)
    if (!form) {
      throw createError({ statusCode: 400, statusMessage: 'expected multipart form data' })
    }
    for (const part of form) {
      const name = part.name ?? ''
      if (name === 'provider' && part.data) provider = part.data.toString('utf8').trim() || undefined
      else if (name === 'kind' && part.data) kind = part.data.toString('utf8').trim() || undefined
      else if ((name === 'file' || name === 'csv') && part.data) {
        text = part.data.toString('utf8')
      }
    }
  } else {
    text = await readRawBody(event, 'utf8') ?? ''
    const q = getQuery(event)
    if (typeof q.provider === 'string') provider = q.provider
    if (typeof q.kind === 'string') kind = q.kind
  }

  if (!text.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'empty body' })
  }

  const r = repo()
  const before = r.eventCount()

  if (looksLikeNntArchive(text)) {
    let records
    try {
      records = parseNntArchive(text)
    } catch (err) {
      throw createError({
        statusCode: 400,
        statusMessage: err instanceof Error ? err.message : 'nnt archive parse failed',
      })
    }
    const result = r.ingest(records)
    notifyIngest()
    return { ...result, added: r.eventCount() - before, format: 'nnt' }
  }

  const { prices } = loadPriceTable()
  let records
  try {
    records = await importCsv(text, { provider, kind, prices })
  } catch (err) {
    throw createError({
      statusCode: 400,
      statusMessage: err instanceof Error ? err.message : 'CSV parse failed',
    })
  }

  if (records.length === 0) {
    return { events: 0, written: 0, duplicates: 0, limits: 0, scopes: 0, added: 0, format: 'csv' }
  }

  const result = r.ingest(records)
  notifyIngest()
  return { ...result, added: r.eventCount() - before, format: 'csv' }
})
