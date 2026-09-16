import type { Exercise } from '@/proto/api/v1/shared_pb'

import { useCallback, useEffect, useState } from 'react'

import { listExercises } from '@/http/requests'
import { useExercisesWithPending } from '@/stores/pendingExercises'
import { appendPage } from '@/utils/appendPage'
import { usePagination } from '@/utils/usePagination'

/**
 * The exercise library, a page at a time, as the sheets that offer it read it.
 *
 * Searching filters what has already been fetched rather than asking the API
 * again: the list is short enough for that, and it keeps the field responsive
 * between keystrokes. A page that fails leaves its token in place, so `failed`
 * means there is still a page to reach and a retry to offer — never that the
 * list has ended.
 */
export const useExerciseLibrary = () => {
  const { currentPageToken, hasMorePages, setFromResponse } = usePagination()

  const [options, setOptions] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [search, setSearch] = useState('')

  const fetchPage = useCallback(async () => {
    setFailed(false)
    const res = await listExercises(currentPageToken())
    if (!res) {
      setFailed(true)
      return
    }

    setOptions((current) => appendPage(current, res.exercises))
    setFromResponse(res.pagination)
    setLoaded(true)
  }, [currentPageToken, setFromResponse])

  useEffect(() => {
    const load = async () => {
      await fetchPage()
      setLoading(false)
    }
    void load()
  }, [fetchPage])

  const loadMore = useCallback(() => {
    setLoading(true)
    void fetchPage().finally(() => setLoading(false))
  }, [fetchPage])

  const query = search.trim().toLowerCase()
  const available = useExercisesWithPending(options)

  return {
    /**
     * Every exercise fetched so far, in the order the API returned them, led by
     * the ones created on this device that have not reached the backend yet.
     */
    options: available,
    /** A page is in flight, the first one included. */
    loading,
    /** A page has arrived, so an empty list is empty rather than unfetched. */
    loaded,
    /** The last page asked for did not arrive. */
    failed,
    search,
    setSearch,
    /** Whether the exercise survives the search field, by name or by tag. */
    matchesSearch: (exercise: Exercise) =>
      !query || [exercise.name, ...exercise.tags].join(' ').toLowerCase().includes(query),
    hasMorePages,
    /** Fetches the next page, and retries the page that failed. */
    loadMore,
  }
}
