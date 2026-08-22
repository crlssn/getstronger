import { ChevronLeftIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'

import { tabRootFor } from '@/router/tabs'
import { selectActionButtonActive, useActionButton } from '@/stores/actionButton'
import { holdPageNavAction } from '@/stores/pageNavAction'
import { usePageTitleStore } from '@/stores/pageTitle'
import { ActionButton } from '@/ui/components/ActionButton'
import { AppButton } from '@/ui/components/AppButton'
import styles from './AppNavTop.module.css'

const tabLabelKeys: Record<string, string> = {
  '/home': 'nav.home',
  '/workout': 'nav.workout',
  '/plans': 'nav.training',
  '/routines': 'nav.training',
  '/exercises': 'nav.exercises',
  '/profile': 'nav.me',
}

/** The header for a screen pushed on top of a tab: a way back, and a title. */
export const AppNavTop = () => {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  const pageTitle = usePageTitleStore((state) => state.pageTitle)
  const action = useActionButton((state) => state.action)
  const icon = useActionButton((state) => state.icon)
  const actionActive = useActionButton(selectActionButtonActive)

  const parentTab = tabRootFor(pathname)

  // This bar only renders on a screen pushed onto a tab, so there is always
  // somewhere to go back to — but not always a history entry to go back
  // through, because the screen may have been opened from a link or a bookmark.
  const goBack = () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate(parentTab)
  }

  return (
    <header className={styles.pageNav}>
      {/* A small back row above the title, not a centered bar around it: the
          chevron carries the parent tab's name so back says where it goes. */}
      <AppButton
        type="button"
        colour="ghost"
        size="sm"
        width="auto"
        className={styles.back}
        onClick={goBack}
      >
        <ChevronLeftIcon className="size-5" aria-hidden="true" />{' '}
        {t(tabLabelKeys[parentTab] ?? 'nav.home')}
      </AppButton>

      <div className={styles.titleRow}>
        <h1>{pageTitle}</h1>
        {/* Screens can portal their own action (a dropdown, say) into here. */}
        <div id="page-nav-action" className={styles.pageAction} ref={holdPageNavAction}>
          {actionActive && icon && <ActionButton action={action} icon={icon} />}
        </div>
      </div>
    </header>
  )
}
