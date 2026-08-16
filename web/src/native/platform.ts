import { Capacitor } from '@capacitor/core'

// Wires up behaviour that only exists inside the native app shell. The plugin
// modules are imported dynamically so browser bundles never execute them.
export const initNativePlatform = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return

  const [{ App }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'),
    import('@capacitor/splash-screen'),
  ])

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
