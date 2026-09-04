'use client'

/**
 * Load one thing from the API, with the four states every screen needs.
 *
 * Twenty screens in the admin console and the student portal do the same thing:
 * fetch on mount, show a skeleton, show a sentence if it failed, offer a retry,
 * and refetch when something else on the page changed it. Written out at each
 * call site that is five `useState`s and an `AbortController`, and the one that
 * gets it wrong is the one that sets state after unmount.
 *
 * ## Why not React Query
 *
 * It would fit, and it is a dependency this app does not otherwise need. There is
 * no cross-screen cache to invalidate here (each console page owns its data and
 * refetches on a live event), no optimistic mutation, and no offline queue —
 * the scanner has its own, in IndexedDB, because a browser cache is not durable
 * enough for a check-in. That leaves request deduplication and a `refresh()`
 * function, which is this file.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiError } from '@orientation/contracts'

import type { ApiResult } from '@/lib/api'

export interface Resource<T> {
  data: T | null
  error: ApiError | null
  /** True only for the first load. A refresh leaves the old data on screen. */
  loading: boolean
  /** True while a refresh is in flight and stale data is still displayed. */
  refreshing: boolean
  /** Refetch now. Safe to call from an event handler or an SSE listener. */
  refresh: () => void
  /** Replace the data locally, for a mutation whose response is the new state. */
  set: (next: T) => void
}

/**
 * @param fetcher Must be stable — wrap it in `useCallback` — or this refetches on
 *   every render. It receives a signal that is aborted on unmount and on the next
 *   refresh, so an in-flight request cannot land after a newer one.
 * @param deps Refetch when these change. Same contract as `useEffect`.
 */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<ApiResult<T>>,
  deps: readonly unknown[] = [],
): Resource<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // A monotonic token, not a boolean. Two refreshes triggered a millisecond apart
  // — a click plus an SSE event — must not let the slower one overwrite the
  // faster one's result, and only comparing sequence numbers catches that.
  const sequence = useRef(0)
  const mounted = useRef(true)
  const inFlight = useRef<AbortController | null>(null)
  const hasLoaded = useRef(false)

  const run = useCallback(async () => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    const ticket = (sequence.current += 1)
    if (hasLoaded.current) setRefreshing(true)

    const result = await fetcher(controller.signal)

    if (!mounted.current || ticket !== sequence.current) return

    if (result.ok) {
      setData(result.data)
      setError(null)
    } else {
      setError(result.error)
    }
    hasLoaded.current = true
    setLoading(false)
    setRefreshing(false)
    // `fetcher` is the caller's, and is required to be stable. Listing `deps`
    // here is what makes the hook refetch when a filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher, ...deps])

  useEffect(() => {
    mounted.current = true
    void run()
    return () => {
      mounted.current = false
      inFlight.current?.abort()
    }
  }, [run])

  const refresh = useCallback(() => {
    void run()
  }, [run])

  const set = useCallback((next: T) => {
    // Claim the current sequence number so an in-flight refresh cannot undo a
    // mutation the user just made.
    sequence.current += 1
    inFlight.current?.abort()
    setData(next)
    setError(null)
  }, [])

  return { data, error, loading, refreshing, refresh, set }
}

/**
 * The other half of the pattern: run a mutation, track the one in flight, keep
 * the error where a form can render it.
 *
 * Deliberately holds a single `pending` flag rather than one per row. A console
 * that lets an operator fire eight overlapping writes at the same registration is
 * a console that produces support tickets; the button is disabled while its
 * request is out.
 */
export interface Mutation<A, T> {
  run: (args: A) => Promise<ApiResult<T>>
  pending: boolean
  error: ApiError | null
  /** Clear the error, e.g. when the operator edits the field it complained about. */
  reset: () => void
}

export function useMutation<A, T>(action: (args: A) => Promise<ApiResult<T>>): Mutation<A, T> {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(
    async (args: A): Promise<ApiResult<T>> => {
      setPending(true)
      setError(null)
      const result = await action(args)
      if (mounted.current) {
        setPending(false)
        if (!result.ok) setError(result.error)
      }
      return result
    },
    [action],
  )

  const reset = useCallback(() => setError(null), [])

  return { run, pending, error, reset }
}
