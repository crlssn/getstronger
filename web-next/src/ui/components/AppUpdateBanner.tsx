import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { useAppVersionStore } from '@/stores/appVersion'
import styles from './AppUpdateBanner.module.css'

// Prompts rather than reloading on its own: a reload mid-set would interrupt a
// workout the user is in the middle of logging.
export const AppUpdateBanner = () => {
  const { t } = useTranslation()
  const updateAvailable = useAppVersionStore((state) => state.updateAvailable)

  useEffect(() => {
    const version = useAppVersionStore.getState()
    version.start()
    return () => version.stop()
  }, [])

  if (!updateAvailable) return null

  return (
    <div className={styles.updateBanner} role="status">
      <ArrowPathIcon aria-hidden="true" />
      <p>{t('update.available')}</p>
      <button
        type="button"
        className={styles.refresh}
        onClick={() => useAppVersionStore.getState().refresh()}
      >
        {t('update.refresh')}
      </button>
      <button
        type="button"
        className={styles.dismiss}
        aria-label={t('common.close')}
        onClick={() => void useAppVersionStore.getState().dismiss()}
      >
        <XMarkIcon aria-hidden="true" />
      </button>
    </div>
  )
}
