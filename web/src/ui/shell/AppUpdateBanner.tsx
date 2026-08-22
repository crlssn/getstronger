import { ArrowPathIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { AppButton } from '@/ui/components/AppButton'
import { AppIconButton } from '@/ui/components/AppIconButton'
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
      <AppButton
        type="button"
        colour="secondary"
        size="sm"
        width="auto"
        className={styles.refresh}
        onClick={() => useAppVersionStore.getState().refresh()}
      >
        {t('update.refresh')}
      </AppButton>
      <AppIconButton
        className={styles.dismiss}
        icon={XMarkIcon}
        label={t('common.close')}
        onClick={() => void useAppVersionStore.getState().dismiss()}
      />
    </div>
  )
}
