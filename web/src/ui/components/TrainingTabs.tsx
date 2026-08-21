import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'

import { cn } from '@/ui/cn'

// Routed rather than local state, so each tab is its own addressable page and
// /routines is reachable from the UI instead of only by typing the URL.
export const TrainingTabs = () => {
  const { t } = useTranslation()

  const selected = ({ isActive }: { isActive: boolean }) => cn(isActive && 'is-selected')

  return (
    <nav className="segmented" aria-label={t('training.heading')}>
      <NavLink to="/plans" className={selected}>
        {t('common.plans')}
      </NavLink>
      <NavLink to="/routines" className={selected}>
        {t('common.routines')}
      </NavLink>
    </nav>
  )
}
