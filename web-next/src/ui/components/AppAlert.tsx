import { CheckCircleIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'

import { useAlertStore } from '@/stores/alerts'
import { cn } from '@/ui/cn'
import styles from './AppAlert.module.css'

interface Props {
  /**
   * Narrows the alert's content column.
   *
   * The card spans the viewport, but its contents belong to whatever column
   * the shell around it uses. Vue reached in with `:deep`; a CSS module hashes
   * its class names, so the shell hands the class down instead.
   */
  contentClassName?: string
}

/**
 * The single alert region, shown under the header.
 *
 * An alert is raised before a navigation and read after it, so it survives one
 * change of screen and is cleared by the next. Without that it would be gone
 * before the screen that explains it had rendered.
 */
export const AppAlert = ({ contentClassName }: Props = {}) => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const alert = useAlertStore((state) => state.alert)

  const previousPath = useRef(pathname)

  useEffect(() => {
    // Only a real change of screen ages an alert. An effect fires on mount as
    // well, where Vue's watch did not, and consuming a turn there would spend
    // the alert before the screen it was raised for had rendered.
    if (previousPath.current === pathname) return
    previousPath.current = pathname

    const { alert: current, markSeen, clear } = useAlertStore.getState()
    if (!current) return
    if (!current.seen) markSeen()
    else clear()
  }, [pathname])

  if (!alert) return null

  return (
    <div className={styles.alertRegion}>
      <div
        className={cn(styles.alertCard, styles[alert.type])}
        role={alert.type === 'error' ? 'alert' : 'status'}
        aria-live="polite"
      >
        <div className={cn(styles.alertCardInner, contentClassName)}>
          {alert.type === 'success' ? (
            <CheckCircleIcon className={styles.statusIcon} aria-hidden="true" />
          ) : (
            <ExclamationTriangleIcon className={styles.statusIcon} aria-hidden="true" />
          )}
          <p>{alert.message}</p>
          <button
            type="button"
            aria-label={t('common.dismiss')}
            onClick={() => useAlertStore.getState().clear()}
          >
            <XMarkIcon aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
