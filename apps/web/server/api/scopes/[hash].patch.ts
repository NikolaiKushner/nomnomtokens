export default defineEventHandler(async (event) => {
  const hash = getRouterParam(event, 'hash')
  if (!hash) {
    throw createError({ statusCode: 400, statusMessage: 'missing scope hash' })
  }
  const body = await readBody<{ label?: string, client?: string | null }>(event)
  const ok = repo().updateScope(hash, {
    label: body?.label,
    client: body?.client,
  })
  if (!ok) {
    throw createError({ statusCode: 404, statusMessage: 'unknown project' })
  }
  notifyIngest()
  return { ok: true }
})
