import { Outlet, useLocation } from 'react-router-dom'

import { isTabRoot } from '@/router/tabs'
import { hidesTabBarPath, isFocusedShellPath } from '@/router/routes'
import { cn } from '@/ui/cn'
import { AppNavBottom } from '@/ui/shell/AppNavBottom'
import { AppNavTop } from '@/ui/shell/AppNavTop'
import { AppRestTimerBanner } from '@/ui/shell/AppRestTimerBanner'
import { AppScreenTransition } from '@/ui/shell/AppScreenTransition'
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
  // A create or edit screen is a task rather than a place, so it keeps the way
  // back and gives up the way sideways: the tab bar and a sticky action bar
  // together took around 180px of an 844px screen, and the form scrolled
  // behind both of them.
  const tabBarHidden = focusedShell || hidesTabBarPath(pathname)

  return (
    <div
      className={cn(
        styles.dashboardShell,
        focusedShell && styles.focusedShell,
        tabBarHidden && styles.noTabBar,
      )}
    >
      <AppRestTimerBanner />
      <main className={styles.main}>
        {showsTopNavigation && <AppNavTop />}
        <AppScreenTransition transitionKey={pathname}>
          <Outlet />
        </AppScreenTransition>
      </main>
      {!tabBarHidden && <AppNavBottom />}
    </div>
  )
}
