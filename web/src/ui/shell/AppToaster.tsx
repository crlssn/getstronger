import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import type { ToastType } from '@/types/toast'

import { AppIconButton } from '@/ui/components/AppIconButton'
import { useToastStore } from '@/stores/toasts'
import { cn } from '@/ui/cn'
import styles from './AppToaster.module.css'

const icons = {
  success: CheckCircleIcon,
  error: ExclamationCircleIcon,
  warning: ExclamationTriangleIcon,
  info: InformationCircleIcon,
}

/** Something went wrong interrupts; something went right does not. */
const interrupts = (type: ToastType) => type === 'error' || type === 'warning'

/**
 * The transient message, floating over whichever shell is on screen.
 *
 * The region is always mounted so a screen reader is watching it before the
 * first message lands, and it lets taps through everywhere the card is not.
 */
export const AppToaster = () => {
  const { t } = useTranslation()
  const toast = useToastStore((state) => state.toast)

  const Icon = toast ? icons[toast.type] : null

  return (
    <div className={styles.toastRegion}>
      {toast && Icon && (
        // Keyed so a new message replaces the card rather than editing it,
        // which is what makes a screen reader announce the second one.
        <div
          key={toast.id}
          className={cn(styles.toast, styles[toast.type])}
          role={interrupts(toast.type) ? 'alert' : 'status'}
        >
          <Icon className={styles.statusIcon} aria-hidden="true" />
          <p>{toast.message}</p>
          <AppIconButton
            className={styles.dismiss}
            icon={XMarkIcon}
            label={t('common.dismiss')}
            onClick={() => useToastStore.getState().dismiss()}
          />
        </div>
      )}
    </div>
  )
}
