import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { historyIndex } from '@/router/navigation'

/**
 * Leaves the current screen: back to wherever it was opened from, or to
 * `fallback` in its place when it was opened from a link and there is nowhere
 * to go back to. For screens that finish a task — a save, a delete — so back
 * afterwards never lands on the form or the item that is gone.
 */
export const useLeave = () => {
  const navigate = useNavigate()
  return useCallback(
    async (fallback: string) => {
      if (historyIndex() > 0) await navigate(-1)
      else await navigate(fallback, { replace: true })
    },
    [navigate],
  )
}
