'use client'

/**
 * Cursor pagination, with the same four states `useResource` gives a single fetch.
 *
 * The registrations, moderation and audit tables page over 15,000 rows with a
 * `nextCursor`, which `useResource` cannot express — it replaces its data on every
 * fetch, and "load more" has to append. So this is its sibling: the first page
 * reloads whenever the filters in `deps` change (throwing away accumulated pages,
 * which is correct — a new filter is a new list), and `loadMore` appends the next
 * page onto the tail.
 *
 * A live event calls `refresh()`, which reloads page one. That resets pagination to
 * the top, which is the right behaviour for these tables: the newest registration
 * belongs at the front, not appended after whatever the operator had scrolled to.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { ApiError, Page } from '@orientation/contracts'

import type { ApiResult } from '@/lib/api'

export interface Paged<T> {
  items: T[]
  error: ApiError | null
  /** First page for the current filters is loading; the table is empty. */
  loading: boolean
  /** A subsequent page is loading; existing rows stay on screen. */
  loadingMore: boolean
  /** There is another page after the ones held. */
  hasMore: boolean
  loadMore: () => void
  /** Reload page one for the current filters. Set silent: true to avoid resetting loading spinner. */
  refresh: (opts?: { silent?: boolean } | unknown) => void
  /** Patch one row in place after a mutation returns its new state. */
  patch: (match: (row: T) => boolean, next: (row: T) => T) => void
}

/**
 * @param fetchPage Must be stable — wrap in `useCallback` with the filters in its
 *   deps. Receives the cursor (`undefined` for page one) and an abort signal.
 * @param deps Reload page one when these change. The filter values, same contract
 *   as `useResource`.
 */
export function usePaged<T>(
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<ApiResult<Page<T>>>,
  deps: readonly unknown[] = [],
): Paged<T> {
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const mounted = useRef(true)
  const sequence = useRef(0)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      inFlight.current?.abort()
    }
  }, [])

  const loadFirst = useCallback(async (opts?: { silent?: boolean }) => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller
    const ticket = (sequence.current += 1)

    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }

    const result = await fetchPage(undefined, controller.signal)
    if (!mounted.current || ticket !== sequence.current) return

    if (result.ok) {
      setItems(result.data.items)
      setCursor(result.data.nextCursor)
      if (opts?.silent) {
        setError(null)
      }
    } else if (!opts?.silent) {
      setError(result.error)
    }
    if (!opts?.silent) {
      setLoading(false)
    }
    // `fetchPage` is the caller's and required stable; `deps` is what reloads on a
    // filter change, exactly as in `useResource`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage, ...deps])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore) return
    const next = cursor
    void (async () => {
      setLoadingMore(true)
      const controller = new AbortController()
      const result = await fetchPage(next, controller.signal)
      if (!mounted.current) return
      if (result.ok) {
        setItems((prev) => [...prev, ...result.data.items])
        setCursor(result.data.nextCursor)
      } else {
        setError(result.error)
      }
      setLoadingMore(false)
    })()
  }, [cursor, loadingMore, fetchPage])

  const refresh = useCallback((opts?: { silent?: boolean } | unknown) => {
    const isSilent =
      typeof opts === 'object' &&
      opts !== null &&
      'silent' in opts &&
      (opts as { silent?: boolean }).silent === true
    void loadFirst({ silent: isSilent })
  }, [loadFirst])

  const patch = useCallback((match: (row: T) => boolean, next: (row: T) => T) => {
    setItems((prev) => prev.map((row) => (match(row) ? next(row) : row)))
  }, [])

  return { items, error, loading, loadingMore, hasMore: cursor !== null, loadMore, refresh, patch }
}
