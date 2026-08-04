/**
 * SSE stream of aggregate updates.
 *
 * Two h3 details this depends on:
 *
 *  - Frames are pushed as structured messages, not pre-formatted text. h3 does
 *    the SSE framing itself, so a hand-built "event: …\ndata: …" string would
 *    be wrapped a second time and arrive as garbage.
 *  - Nothing may be awaited before `stream.send()` is returned. The response
 *    has not started at that point, so awaiting a push there deadlocks the
 *    request — the client waits forever and never even receives headers.
 *    The opening frame is therefore scheduled, not awaited.
 */
export default defineEventHandler((event) => {
  const stream = createEventStream(event)

  const send = (frame: Record<string, unknown>) =>
    void stream.push({ event: 'stats', data: JSON.stringify(frame) })

  // A reconnecting client must be correct immediately rather than after the
  // next tick, so open with a full snapshot.
  setTimeout(() => send(buildFrame()), 0)

  const unsubscribe = subscribe(send)

  const heartbeat = setInterval(() => {
    void stream.push({ event: 'ping', data: '1' })
  }, 20_000)
  heartbeat.unref?.()

  stream.onClosed(() => {
    clearInterval(heartbeat)
    unsubscribe()
  })

  return stream.send()
})
