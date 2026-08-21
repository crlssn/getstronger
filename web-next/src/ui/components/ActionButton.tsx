import type { ComponentProps, ComponentType } from 'react'

import { useTranslation } from 'react-i18next'

import styles from './ActionButton.module.css'

interface Props {
  action: () => void
  icon: ComponentType<ComponentProps<'svg'>>
}

/** The single action a screen may put in the header beside its title. */
export const ActionButton = ({ action, icon: Icon }: Props) => {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      className={styles.actionButton}
      aria-label={t('common.pageAction')}
      onClick={action}
    >
      <Icon aria-hidden="true" />
    </button>
  )
}
