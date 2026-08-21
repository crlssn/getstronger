import { Outlet, useLocation } from 'react-router-dom'

import { isTabRoot } from '@/router/tabs'
import { isFocusedShellPath } from '@/router/routes'
import { cn } from '@/ui/cn'
import { AppAlert } from '@/ui/components/AppAlert'
import { AppNavBottom } from '@/ui/components/AppNavBottom'
import { AppNavTop } from '@/ui/components/AppNavTop'
import { AppRestTimerBanner } from '@/ui/components/AppRestTimerBanner'
import styles from './AppDashboard.module.css'

/**
 * The shell a signed-in user sees.
 *
 * An active workout takes over the whole screen: the global tab bar would
 * steal logging space and invite accidental mid-workout navigation, so the
 * focused shell hides it until the user leaves or completes the session.
 */
export const AppDashboard = () => {
  const { pathname } = useLocation()

  const focusedShell = isFocusedShellPath(pathname)
  // Split by depth, not by name. A tab root opens with its own large title; a
  // screen pushed on top of one gets the nav bar and a way back.
  const showsTopNavigation = !focusedShell && !isTabRoot(pathname)

  return (
    <div className={cn(styles.dashboardShell, focusedShell && styles.focusedShell)}>
      <AppAlert />
      <AppRestTimerBanner />
      <main className={styles.main}>
        {showsTopNavigation && <AppNavTop />}
        <Outlet />
      </main>
      {!focusedShell && <AppNavBottom />}
    </div>
  )
}
