import { selectAuthorised, useAuthStore } from '@/stores/auth'
import { AppConfirmDialog } from '@/ui/components/AppConfirmDialog'
import { AppDashboard } from '@/ui/components/AppDashboard'
import { AppOfflineBanner } from '@/ui/components/AppOfflineBanner'
import { AppToaster } from '@/ui/components/AppToaster'
import { AppUpdateBanner } from '@/ui/components/AppUpdateBanner'
import { GuestView } from '@/ui/components/GuestView'
import styles from './App.module.css'

/**
 * The root of every route: one of the two shells, plus the app-level singletons.
 *
 * Which shell is chosen follows the token rather than the route, so a session
 * that expires under the user takes the chrome with it rather than leaving a
 * signed-in frame around a login form.
 */
export const App = () => {
  const authorised = useAuthStore(selectAuthorised)

  return (
    <>
      <div className={styles.statusbarScrim} aria-hidden="true" />
      {authorised ? <AppDashboard /> : <GuestView />}
      <AppToaster />
      <AppOfflineBanner />
      <AppUpdateBanner />
      <AppConfirmDialog />
    </>
  )
}
