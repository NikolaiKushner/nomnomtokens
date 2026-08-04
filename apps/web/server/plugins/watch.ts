import { ClaudeCodeAdapter } from '@nomnomtokens/adapters'

/**
 * Tail the transcripts from inside the server process.
 *
 * This is what makes `nnt serve` alone enough for live updates: no second
 * terminal running `nnt scan --watch`. External writers still work — see
 * watchForExternalWrites — so running both is harmless, and upsert makes the
 * overlap a no-op rather than a double count.
 */
export default defineNitroPlugin((nitro) => {
  if (process.env.NOMNOMTOKENS_NO_WATCH === '1') return

  const adapter = new ClaudeCodeAdapter()
  let stop: (() => void) | undefined

  void adapter.detect().then((found) => {
    if (!found) return
    stop = adapter.watch((record) => {
      repo().ingest([record])
      notifyIngest()
    })
  })

  watchForExternalWrites()

  nitro.hooks.hook('close', () => stop?.())
})
