import { Outlet, useLocation } from 'react-router-dom'

import { isTabRoot } from '@/router/tabs'
import { routes } from '@/router/routes'
import { cn } from '@/ui/cn'
import { AppAlert } from '@/ui/components/AppAlert'
import { AppNavBottom } from '@/ui/components/AppNavBottom'
import { AppNavTop } from '@/ui/components/AppNavTop'
import { AppRestTimerBanner } from '@/ui/components/AppRestTimerBanner'
import styles from './AppDashboard.module.css'

// Declared on the route rather than listed here, so the shell cannot disagree
// with the router about which screens hide the chrome.
const focusedPaths = new Set(
  routes.filter((route) => route.focusedShell).map((route) => route.path),
)

const isFocused = (pathname: string) =>
  [...focusedPaths].some((path) => {
    if (!path.includes(':')) return pathname === path
    // '/workouts/routine/:routine_id' matches any single segment in its place.
    const pattern = new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`)
    return pattern.test(pathname)
  })

/**
 * The shell a signed-in user sees.
 *
 * An active workout takes over the whole screen: the global tab bar would
 * steal logging space and invite accidental mid-workout navigation, so the
 * focused shell hides it until the user leaves or completes the session.
 */
export const AppDashboard = () => {
  const { pathname } = useLocation()

  const focusedShell = isFocused(pathname)
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
