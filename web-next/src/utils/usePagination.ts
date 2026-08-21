import type { PaginationResponse } from '@/proto/api/v1/shared_pb'

import { useCallback, useRef, useState } from 'react'

export const emptyPageToken: Uint8Array = new Uint8Array(0)

export const resolvePageToken = (res: PaginationResponse | undefined): Uint8Array =>
  res?.nextPageToken?.length ? res.nextPageToken : emptyPageToken

/**
 * The page token for a list that fetches as the reader scrolls.
 *
 * The token is kept in a ref as well as in state: a fetch triggered by the
 * scroll sentinel reads it during the same tick it was set, before React has
 * re-rendered with the new value.
 */
export const usePagination = () => {
  const [pageToken, setPageTokenState] = useState<Uint8Array>(emptyPageToken)
  const latest = useRef(pageToken)

  const setPageToken = useCallback((token: Uint8Array) => {
    latest.current = token
    setPageTokenState(token)
  }, [])

  const setFromResponse = useCallback(
    (res: PaginationResponse | undefined) => setPageToken(resolvePageToken(res)),
    [setPageToken],
  )

  const reset = useCallback(() => setPageToken(emptyPageToken), [setPageToken])

  return {
    pageToken,
    /** The token as of right now, including a set that has not rendered yet. */
    currentPageToken: () => latest.current,
    hasMorePages: pageToken.length > 0,
    setPageToken,
    setFromResponse,
    reset,
    emptyPageToken,
  }
}
