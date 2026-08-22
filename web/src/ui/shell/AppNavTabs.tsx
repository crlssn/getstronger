import { Link, useLocation } from 'react-router-dom'

import { selectNavTabsActive, useNavTabs } from '@/stores/navTabs'
import { cn } from '@/ui/cn'
import styles from './AppNavTabs.module.css'

/**
 * The secondary tabs a screen can put under its title.
 *
 * The tabs come from the store rather than from props, because the screen that
 * owns them is rendered below this bar rather than around it.
 */
export const AppNavTabs = () => {
  const tabs = useNavTabs((state) => state.tabs)
  const active = useNavTabs(selectNavTabsActive)
  const { pathname, search } = useLocation()

  if (!active) return null

  return (
    <nav className={styles.nav}>
      <div className={styles.container}>
        {tabs.map((tab) => {
          const current = `${pathname}${search}` === tab.href
          return (
            <Link
              key={tab.name}
              to={tab.href}
              className={cn(styles.tab, current && styles.active)}
              aria-current={current ? 'page' : undefined}
            >
              {tab.name}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
