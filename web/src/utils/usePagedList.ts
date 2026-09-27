import type { PaginationResponse } from '@/proto/api/v1/shared_pb'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { appendPage, refreshFirstPage } from '@/utils/appendPage'
import { emptyPageToken, usePagination } from '@/utils/usePagination'

/** One page of a list, as a screen's fetcher hands it over. */
export interface Page<T> {
  rows: T[]
  pagination?: PaginationResponse
}

interface Snapshot {
  rows: unknown[]
  pageToken: Uint8Array
}

/** How many lists are kept to go back to; the oldest goes first. */
export const snapshotLimit = 10

// Keyed by history entry, in the order they were last written: a Map iterates
// in insertion order, so the first key is always the one to evict.
const snapshots = new Map<string, Snapshot>()

/** Forgets every list, so the next account inherits none of them. */
export const clearListSnapshots = () => snapshots.clear()

const remember = (key: string, snapshot: Snapshot) => {
  snapshots.delete(key)
  snapshots.set(key, snapshot)
  const oldest = snapshots.keys().next().value
  if (snapshots.size > snapshotLimit && oldest !== undefined) snapshots.delete(oldest)
}

/**
 * A list that pages in as the reader scrolls, and is still there when they
 * come back to it.
 *
 * Every page it holds is filed against the history entry it belongs to. Going
 * back restores them before the first paint, then asks for the first page again
 * behind them; a push always starts fresh. Scroll position is
 * `<ScrollRestoration>`'s job, which works because the rows are already there.
 */
export const usePagedList = <T extends { id: string }>(
  /** Tells apart two lists on one screen. */
  name: string,
  fetchPage: (pageToken: Uint8Array) => Promise<Page<T> | void>,
) => {
  // Every push mints a new key, so only a return to this entry finds one.
  const snapshotKey = `${useLocation().key}:${name}`
  const [restored] = useState(
    () => snapshots.get(snapshotKey) as (Snapshot & { rows: T[] }) | undefined,
  )

  const { pageToken, hasMorePages, currentPageToken, setFromResponse } = usePagination(
    restored?.pageToken,
  )
  const [rows, setRows] = useState<T[]>(restored?.rows ?? [])
  const [loaded, setLoaded] = useState(restored !== undefined)
  const [fetching, setFetching] = useState(false)
  const [failed, setFailed] = useState(false)

  const fetcher = useRef(fetchPage)
  useEffect(() => {
    fetcher.current = fetchPage
  })

  const inFlight = useRef(false)
  // A page asked for mid-revalidation waits for it, so it pages on from the
  // rows the revalidation settled on rather than racing it.
  const revalidation = useRef<Promise<void>>(undefined)

  const fetchMore = useCallback(async () => {
    // Only when there is one: a needless await would defer the fetching state
    // past the answer, and a sentinel waiting for it to flip would never re-arm.
    if (revalidation.current) await revalidation.current
    if (inFlight.current) return
    inFlight.current = true
    setFetching(true)
    setFailed(false)

    try {
      const page = await fetcher.current(currentPageToken())
      if (!page) {
        setFailed(true)
        return
      }

      setRows((current) => appendPage(current, page.rows))
      setFromResponse(page.pagination)
    } finally {
      inFlight.current = false
      setFetching(false)
      setLoaded(true)
    }
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    if (!restored) {
      void fetchMore()
      return
    }

    // Quiet: no spinner, and a failure leaves the restored page standing.
    revalidation.current ??= fetcher.current(emptyPageToken).then((page) => {
      if (!page) return
      const refreshed = refreshFirstPage(restored.rows, page.rows)
      setRows(refreshed ?? page.rows)
      if (!refreshed) setFromResponse(page.pagination)
    })
  }, [restored, fetchMore, setFromResponse])

  // An empty list is not worth restoring: there is nothing to scroll back to.
  useEffect(() => {
    if (rows.length) remember(snapshotKey, { rows, pageToken })
  }, [snapshotKey, rows, pageToken])

  return { rows, setRows, loaded, fetching, failed, hasMorePages, fetchMore }
}
