'use client'

/**
 * One `EventSource` for a whole screen, shared by everything on it.
 *
 * `useEventStream` opens a connection per call. That is correct for a page with one
 * live widget and wrong for every page in this application: the student portal has a
 * status watcher and an announcement feed, and the admin console will have a dozen
 * tiles that all want `stats.tick`. Left alone, that is a dozen `EventSource`s per
 * operator and two per student — and at 15,000 students the second connection is what
 * pushes the stream route past `sseDegradeThreshold` and starts refusing the first
 * one.
 *
 * So: this provider owns the single connection, and `useRealtime` subscribes to it.
 *
 * ## Subscribing without reconnecting
 *
 * Subscribers are held as refs, not as handler objects. A component that passes an
 * inline `{ broadcast: () => feed.refresh() }` gets a new object every render, and
 * re-registering on each of those would mean a `useEffect` churn per keystroke
 * elsewhere on the page. The ref is registered once and read at dispatch time.
 *
 * ## No provider is not an error
 *
 * `useRealtime` outside a provider opens its own connection instead of going quiet.
 * A hook that silently stops delivering events when somebody forgets a wrapper is a
 * bug that shows up as "the console does not update" three weeks later, on the day.
 * The provider is the optimisation; the hook works either way.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react'

import type { RealtimeEvent } from '@orientation/core/realtime'

import {
  EVENT_NAMES,
  useEventStream,
  type EventHandlers,
  type EventStream,
} from './useEventStream'

interface Shared extends EventStream {
  /** Register a handler ref for the connection's lifetime. Returns an unsubscribe. */
  subscribe: (ref: RefObject<EventHandlers>) => () => void
}

const Ctx = createContext<Shared | null>(null)

export function RealtimeProvider({
  children,
  enabled = true,
}: {
  children: ReactNode
  /** Set false to hold the connection closed — e.g. a scanner working offline. */
  enabled?: boolean
}) {
  const subscribers = useRef<Set<RefObject<EventHandlers>>>(new Set())

  // One handler per event name, each fanning out to every subscriber. Built once:
  // `useEventStream` reads handlers through a ref, so a stable object here means the
  // connection is never rebuilt when a subscriber comes or goes.
  const fanout = useMemo<EventHandlers>(() => {
    const out: Partial<Record<RealtimeEvent['type'], (event: RealtimeEvent) => void>> = {}
    for (const name of EVENT_NAMES) {
      out[name] = (event: RealtimeEvent) => {
        for (const ref of subscribers.current) {
          // Safe by construction: the listener was registered under `event.type`, so
          // the payload is that member of the union. The key is a string to TS.
          const handler = ref.current[event.type] as ((e: RealtimeEvent) => void) | undefined
          try {
            handler?.(event)
          } catch {
            // One subscriber throwing must not stop the rest of the screen updating.
          }
        }
      }
    }
    return out as EventHandlers
  }, [])

  const stream = useEventStream(fanout, { enabled })

  const subscribe = useCallback((ref: RefObject<EventHandlers>) => {
    subscribers.current.add(ref)
    return () => {
      subscribers.current.delete(ref)
    }
  }, [])

  const value = useMemo<Shared>(
    () => ({ status: stream.status, lastEventAt: stream.lastEventAt, subscribe }),
    [stream.status, stream.lastEventAt, subscribe],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Subscribe to the shared stream, or open one if there is no provider above.
 *
 * Same return value as `useEventStream`, so a component can be moved in or out of a
 * provider without changing.
 */
export function useRealtime(handlers: EventHandlers): EventStream {
  const shared = useContext(Ctx)

  const ref = useRef<EventHandlers>(handlers)
  ref.current = handlers

  // Enabled only when there is nothing above to share. Hooks cannot be conditional,
  // and `enabled: false` is the documented way to hold `useEventStream` closed.
  const own = useEventStream(handlers, { enabled: shared === null })

  const subscribe = shared?.subscribe
  useEffect(() => {
    if (subscribe === undefined) return
    return subscribe(ref)
  }, [subscribe])

  return shared ?? own
}
