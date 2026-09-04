/**
 * GET /api/stream — the live layer.
 *
 * One long-lived Server-Sent Events connection per client, fed from Redis Pub/Sub
 * (D10). A student's pass page learns it was approved without polling; the admin
 * console's arrival counter moves as scans land; every scanner learns its manifest went
 * stale seconds after a revocation instead of at the end of its five-minute poll.
 *
 * ## Why SSE and not WebSockets
 *
 * Every message in this system travels server → client. There is no client → server
 * channel here at all: a registration is a POST, a scan is a sync. A WebSocket would
 * buy a direction nobody uses and cost a protocol upgrade that corporate proxies and
 * campus wifi captive portals break more often than they break `text/event-stream`. SSE
 * also reconnects by itself — the browser's `EventSource` retries with backoff and
 * replays `Last-Event-ID` if we ever need it — which is a meaningful amount of client
 * code not written.
 *
 * ## Channel subscriptions, and the role filter
 *
 * A connection subscribes to between two and four channels depending on who is asking:
 *
 * - **broadcast** — everyone. Filtered *in this handler* by `BroadcastEvent.audience`
 *   against the connected actor's role. One channel plus a field beats three channels:
 *   at 15,000 students it is one Redis SUBSCRIBE per process rather than three, and a
 *   "volunteers only" instruction never reaches a student's phone even though it
 *   travelled on the same channel.
 * - **student:{registrationId}** — a student, for their own registration only. The id
 *   comes from the database via their session, never from a query parameter, so there
 *   is no channel a student can name their way into.
 * - **scanner** — volunteers and admins. Manifest staleness and gate window changes.
 * - **admin** — admins only. Registration and check-in firehose for the console.
 *
 * ## Backpressure
 *
 * `sseDegradeThreshold` (default 2,500) caps concurrent streams per process. Past it
 * this route refuses with a 503 and a `retry-after`, and the client falls back to
 * polling. That is a deliberate trade: 15,000 students on one process would be 15,000
 * held sockets, and a held socket that cannot be written to is worse than a poll every
 * thirty seconds. The refusal is at the door rather than by dropping live connections,
 * because a student watching for "approved" should not lose the connection they already
 * have to make room for somebody who just arrived.
 */
import { prisma } from '@orientation/db'
import {
  SSE_HEARTBEAT_LINE,
  SSE_HEARTBEAT_MS,
  adminChannel,
  broadcastChannel,
  scannerChannel,
  sseFrame,
  studentChannel,
  type RealtimeEvent,
} from '@orientation/core/realtime'

import { getActor } from '@/lib/server/auth'
import { getConfig } from '@/lib/server/config'
import { fail, handle } from '@/lib/server/http'
import { subscribe, totalListeners } from '@/lib/server/redis'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Longest a stream is held before the client is asked to reconnect.
 *
 * Serverless platforms cap a response's lifetime and kill it without ceremony; a
 * self-imposed close is a clean `EventSource` reconnect instead of a network error in
 * the console. Also bounds the damage from a leaked subscription: whatever goes wrong,
 * every connection is gone within four minutes.
 */
const MAX_STREAM_MS = 4 * 60_000

export async function GET(request: Request): Promise<Response> {
  // Everything up to `new Response(stream)` runs inside `handle`, so a failure while
  // resolving the actor or the channel list becomes a normal JSON error. Once the
  // stream's headers are on the wire nothing can become an HTTP status any more, which
  // is why the `start` callback below handles its own failures and closes instead.
  return handle(async () => {
    const actor = await getActor()
    if (actor === null) return fail('UNAUTHENTICATED', 'Sign in to continue.')

    const config = await getConfig()

    if (totalListeners() >= config.sseDegradeThreshold) {
      return fail('SERVICE_UNAVAILABLE', 'Live updates are busy. Falling back to refreshing.', {
        // Jittered by the client; a fixed value would bring every refused connection
        // back in the same second and reproduce the overload that caused the refusal.
        retryAfter: 30,
      })
    }

    const channels: string[] = [broadcastChannel()]

    if (actor.role === 'STUDENT') {
      // From the session, not from the request. There is no parameter here to tamper
      // with, so a student cannot subscribe to another student's channel.
      const registration = await prisma.registration.findUnique({
        where: { userId: actor.id },
        select: { id: true },
      })
      if (registration !== null) channels.push(studentChannel(registration.id))
    } else {
      channels.push(scannerChannel())
      if (actor.role === 'ADMIN') channels.push(adminChannel())
    }

    const encoder = new TextEncoder()

    /**
     * Should this connection see this event?
     *
     * Only broadcasts need filtering — every other channel is already scoped to a role
     * or to one registration. `audience` is checked here rather than at publish time so
     * the control room sends one message and every client applies the same rule.
     */
    const visible = (event: RealtimeEvent): boolean => {
      if (event.type !== 'broadcast') return true
      if (event.audience === 'ALL') return true
      if (event.audience === 'STUDENTS') return actor.role === 'STUDENT'
      // VOLUNTEERS. Admins see it too: the control room is the audience for operational
      // instructions as much as the volunteers carrying them out.
      return actor.role === 'VOLUNTEER' || actor.role === 'ADMIN'
    }

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        const unsubscribers: (() => void)[] = []

        // One object rather than two `let`s: `teardown` is reachable from `write`,
        // which runs before the timers exist, so the handles must live somewhere
        // already initialised. A container declared here is; a `const` holding a
        // timer created later would still be in its temporal dead zone.
        const timers: {
          heartbeat?: ReturnType<typeof setInterval>
          deadline?: ReturnType<typeof setTimeout>
        } = {}

        function teardown(): void {
          if (closed) return
          closed = true
          if (timers.heartbeat !== undefined) clearInterval(timers.heartbeat)
          if (timers.deadline !== undefined) clearTimeout(timers.deadline)
          // Every subscription, unconditionally. A missed unsubscribe here is a leak
          // that survives the socket and keeps a handler alive against a dead
          // controller.
          for (const off of unsubscribers) off()
          try {
            controller.close()
          } catch {
            // Already closed by the runtime. Nothing to do.
          }
        }

        const write = (chunk: string): void => {
          if (closed) return
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            // The client vanished between the check and the write. Not an error worth
            // logging 15,000 times during a lecture-hall wifi blip.
            teardown()
          }
        }

        // Sent immediately, before any subscription is established. A client that has
        // not received bytes cannot distinguish "connected, nothing happening" from
        // "the proxy ate my request", and some proxies will not flush a response until
        // they see data.
        write('retry: 3000\n\n')
        write(SSE_HEARTBEAT_LINE)

        for (const channel of channels) {
          // `subscribe` never throws: on a Redis failure it returns a no-op
          // unsubscriber and the stream still opens. That is the right shape — a live
          // layer that is down should look like a quiet event stream, not a broken page.
          const off = await subscribe(channel, (event) => {
            if (!visible(event)) return
            write(sseFrame(event))
          })
          unsubscribers.push(off)
        }

        // Comment-only frames. Not an event, so no client listener fires; enough traffic
        // to stop an intermediary reclaiming an idle socket, which is what silently
        // kills SSE behind campus proxies.
        timers.heartbeat = setInterval(() => write(SSE_HEARTBEAT_LINE), SSE_HEARTBEAT_MS)

        timers.deadline = setTimeout(teardown, MAX_STREAM_MS)

        // Fires when the client navigates away or the platform cancels the request.
        request.signal.addEventListener('abort', teardown, { once: true })
      },

      cancel() {
        // The reader went away. Teardown is reached through the abort listener above and
        // is idempotent; duplicating it here without a handle on the interval would be
        // the leak this comment exists to prevent somebody re-introducing.
      },
    })

    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
        connection: 'keep-alive',
        // The one header nginx needs to not buffer an event stream into uselessness. It
        // is ignored by everything else and costs nothing to send.
        'x-accel-buffering': 'no',
      },
    })
  })
}
