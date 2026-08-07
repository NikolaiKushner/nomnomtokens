import { detectAdapters } from '@nomnomtokens/adapters'
import { loadPriceTable } from '@nomnomtokens/db'

/**
 * Tail adapter sources from inside the server process.
 *
 * This is what makes `nnt serve` alone enough for live updates: no second
 * terminal running `nnt scan --watch`. External writers still work — see
 * watchForExternalWrites — so running both is harmless, and upsert makes the
 * overlap a no-op rather than a double count.
 */
export default defineNitroPlugin((nitro) => {
  if (process.env.NOMNOMTOKENS_NO_WATCH === '1') return

  const stops: Array<() => void> = []
  const { prices } = loadPriceTable()

  void detectAdapters({ prices }).then((adapters) => {
    for (const adapter of adapters) {
      if (!adapter.watch) continue
      stops.push(
        adapter.watch((record) => {
          repo().ingest([record])
          notifyIngest()
        }),
      )
    }
  })

  watchForExternalWrites()

  nitro.hooks.hook('close', () => {
    for (const stop of stops) stop()
  })
})
