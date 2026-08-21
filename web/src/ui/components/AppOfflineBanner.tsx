import { SignalSlashIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { clearOfflineCache } from '@/http/offlineCache'
import { useAuthStore } from '@/stores/auth'
import { useConnectionStore } from '@/stores/connection'
import { startMutationQueue, useMutationQueueStore } from '@/stores/mutationQueue'
import styles from './AppOfflineBanner.module.css'

// Owns the app's offline lifecycle: watches connectivity, tells the user when
// the app is showing saved data, flushes changes queued while offline, and
// sweeps the offline state away on logout.
export const AppOfflineBanner = () => {
  const { t } = useTranslation()
  const online = useConnectionStore((state) => state.online)
  const queued = useMutationQueueStore((state) => state.pending.length)

  useEffect(() => {
    const connection = useConnectionStore.getState()
    connection.start()
    startMutationQueue()
    // Changes queued in a previous session sync as soon as the app starts.
    void useMutationQueueStore.getState().flush()

    return () => connection.stop()
  }, [])

  useEffect(
    () =>
      // Cached responses belong to the account that fetched them, and a queued
      // change must never be replayed into whichever account signs in next.
      useAuthStore.subscribe((state, previous) => {
        if (previous.userId && !state.userId) {
          clearOfflineCache()
          useMutationQueueStore.getState().clear()
        }
      }),
    [],
  )

  if (online) return null

  return (
    <div className={styles.offlineBanner} role="status">
      <SignalSlashIcon aria-hidden="true" />
      <p>
        {t('offline.banner')}
        {queued > 0 && <span> {t('offline.queued', { count: queued })}</span>}
      </p>
    </div>
  )
}
