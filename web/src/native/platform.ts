import { watch } from 'vue'
import { Capacitor } from '@capacitor/core'

import router from '@/router/router'

// The routes of the focused active-workout shell; mirrors focusedShellRoutes
// in AppDashboard.vue. Between sets the phone lies idle on a bench with this
// screen open, which is exactly when the OS would dim and lock it.
export const isWorkoutRoute = (name: unknown): boolean =>
  name === 'workout-routine' || name === 'quick-workout'

// Wires up behaviour that only exists inside the native app shell. The plugin
// modules are imported dynamically so browser bundles never execute them.
export const initNativePlatform = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return

  const [{ App }, { SplashScreen }, { KeepAwake }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
    import('@capacitor-community/keep-awake'),
  ])

  // Keeping the screen awake is tied to being on the workout screen rather
  // than to a draft existing in the store: drafts persist for hours, and
  // leaving the screen also covers finish, cancel, and navigation in one
  // signal. The OS releases the wake flag by itself when the app backgrounds.
  watch(
    () => router.currentRoute.value.name,
    (name) => {
      const call = isWorkoutRoute(name) ? KeepAwake.keepAwake() : KeepAwake.allowSleep()
      call.catch((error: unknown) => console.warn('keep-awake unavailable', error))
      console.debug(`keep-awake ${isWorkoutRoute(name) ? 'engaged' : 'released'}`)
    },
    { immediate: true },
  )

  // The Android hardware back button has no default behaviour once a listener
  // exists, so mirror the browser: walk back through the WebView's history and
  // hand over to the OS at the root instead of dead-ending the user.
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back()
      return
    }

    void App.minimizeApp()
  })

  // The splash screen stays up until the app has mounted (launchAutoHide is
  // off in capacitor.config.ts), so the user never sees an empty WebView.
  await SplashScreen.hide()
}
