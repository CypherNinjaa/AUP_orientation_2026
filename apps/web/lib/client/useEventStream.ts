'use client'

/**
 * The browser end of `/api/stream`.
 *
 * One `EventSource` per page, shared by everything on it. The student's pass page
 * uses it to learn it was approved without polling; the admin console uses it to
 * move the arrivals counter; the scanner uses it to learn its manifest went stale.
 *
 * ## What an event means
 *
 * A notification that state changed — never the state itself. Every handler here
 * responds by re-reading an authoritative endpoint. That is what makes a missed
 * event harmless: Redis Pub/Sub is fire-and-forget, so a client that was
 * reconnecting during a publish never hears it, and the only cost is a stale card
 * until the next event or the next poll.
 *
 * ## Reconnection, and the fallback
 *
 * `EventSource` reconnects by itself with the server's `retry:` interval, so there
 * is no backoff loop in this file. What is here is the *give-up* path: the route
 * refuses with 503 past `sseDegradeThreshold`, and a refused `EventSource` retries
 * forever without ever telling the page. After `MAX_FAILURES` consecutive failures
 * this hook closes the stream and reports `degraded`, and the caller polls instead
 * — which is the documented behaviour at 15,000 concurrent students, not an error.
 */
import { useEffect, useRef, useState } from 'react'

import type { RealtimeEvent } from '@orientation/core/realtime'

/** Consecutive connection failures before the stream is abandoned for polling. */
const MAX_FAILURES = 4

/** How long a connection must survive before it counts as healthy. */
const HEALTHY_AFTER_MS = 10_000

export type StreamStatus = 'connecting' | 'live' | 'degraded'

/**
 * A handler per event name, all optional.
 *
 * Exported because `RealtimeProvider` fans one connection out to many subscribers
 * and needs to name this shape.
 */
export type EventHandlers = Partial<{
  [K in RealtimeEvent['type']]: (event: Extract<RealtimeEvent, { type: K }>) => void
}>

export interface EventStream {
  status: StreamStatus
  /** Epoch ms of the last event of any kind, heartbeats excluded. */
  lastEventAt: number | null
}

/**
 * Subscribe for the lifetime of the component.
 *
 * `handlers` is read through a ref, so a caller may pass a fresh object literal on
 * every render — which is what a component with an inline arrow function does —
 * without tearing down and rebuilding the connection each time. Rebuilding it
 * would mean a new Redis subscription per render, and the 503 threshold exists
 * precisely because those are not free.
 */
export function useEventStream(
  handlers: EventHandlers,
  options: { enabled?: boolean } = {},
): EventStream {
  const enabled = options.enabled ?? true

  const [status, setStatus] = useState<StreamStatus>(enabled ? 'connecting' : 'degraded')
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)

  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!enabled) {
      setStatus('degraded')
      return
    }

    let source: EventSource | null = null
    let failures = 0
    let openedAt = 0
    let closed = false
    let healthyTimer: ReturnType<typeof setTimeout> | undefined

    const dispatch = (raw: MessageEvent<string>): void => {
      let event: RealtimeEvent
      try {
        event = JSON.parse(raw.data) as RealtimeEvent
      } catch {
        // A truncated frame. The next one will be whole; nothing to report.
        return
      }
      setLastEventAt(Date.now())
      // The cast is safe by construction: the listener was registered under
      // `event.type`, so the payload is that member of the union. TypeScript
      // cannot see that through the string key.
      const handler = handlersRef.current[event.type] as ((e: RealtimeEvent) => void) | undefined
      handler?.(event)
    }

    const connect = (): void => {
      if (closed) return

      let streamUrl = '/api/stream'
      if (typeof window !== 'undefined') {
        try {
          const session = localStorage.getItem('orientation2026:student:session')
          if (session) {
            streamUrl += `?session=${encodeURIComponent(session)}`
          }
        } catch {
          // Ignore storage restrictions
        }
      }

      source = new EventSource(streamUrl, { withCredentials: true })
      openedAt = Date.now()

      source.onopen = () => {
        setStatus('live')
        // Not reset to zero here. A connection that opens and dies immediately is
        // the 503 case, and zeroing on `open` would loop forever. The counter is
        // cleared only once a connection has lasted long enough to be real.
        healthyTimer = setTimeout(() => {
          failures = 0
        }, HEALTHY_AFTER_MS)
      }

      source.onerror = () => {
        if (healthyTimer !== undefined) clearTimeout(healthyTimer)
        // `EventSource` reports both a transient drop and a hard refusal here, and
        // the readyState is the only way to tell them apart: CLOSED means it has
        // given up, CONNECTING means it is already retrying on its own.
        const gaveUp = source?.readyState === EventSource.CLOSED
        const wasBrief = Date.now() - openedAt < HEALTHY_AFTER_MS

        if (gaveUp || wasBrief) failures += 1

        if (failures >= MAX_FAILURES) {
          closed = true
          source?.close()
          setStatus('degraded')
          return
        }

        setStatus('connecting')
        if (gaveUp) {
          // It will not retry by itself. Rebuild after a jittered pause — every
          // refused client reconnecting in the same second is what caused the
          // refusal.
          const delay = 2_000 * failures + Math.floor(Math.random() * 1_000)
          setTimeout(connect, delay)
        }
      }

      // One listener per event name rather than `onmessage`. The server sends
      // named events, and an unnamed `onmessage` handler receives none of them —
      // a silent failure that looks exactly like "nothing is happening".
      for (const name of EVENT_NAMES) source.addEventListener(name, dispatch as EventListener)
    }

    connect()

    return () => {
      closed = true
      if (healthyTimer !== undefined) clearTimeout(healthyTimer)
      source?.close()
    }
  }, [enabled])

  return { status, lastEventAt }
}

/**
 * Every `event:` name the server can send.
 *
 * Listed explicitly because `addEventListener` needs a string and the union is a
 * type. A name missing from this array is an event the client silently never
 * hears, so it is kept next to the union it mirrors — `RealtimeEvent` in
 * `packages/core/src/realtime/channels.ts`.
 */
const EVENT_NAMES = [
  'registration.status',
  'broadcast',
  'registration.created',
  'registration.reviewed',
  'checkin.recorded',
  'roster.imported',
  'scanner.synced',
  'stats.tick',
  'manifest.stale',
  'gate.config',
] as const satisfies readonly RealtimeEvent['type'][]

export { EVENT_NAMES }
