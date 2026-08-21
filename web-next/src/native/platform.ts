import { Capacitor } from '@capacitor/core'

import { isFocusedShellPath } from '@/router/routes'

/** Just enough of the data router for this module, so it can be handed a stub. */
export interface NativeRouter {
  state: { location: { pathname: string } }
  subscribe: (listener: (state: { location: { pathname: string } }) => void) => () => void
  navigate: (to: string) => void | Promise<void>
}

/**
 * Maps an incoming deep link to a router path.
 *
 * Universal/App Links arrive as https URLs on the web domain, so their path
 * maps one to one onto the SPA's routes. The custom getstronger:// scheme has
 * no authority part, which makes the URL parser read the first path segment as
 * the host.
 */
export const deepLinkPath = (url: string): string | undefined => {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.pathname + parsed.search + parsed.hash
    }

    return `/${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return undefined
  }
}

/**
 * Wires up behaviour that only exists inside the native app shell.
 *
 * The plugin modules are imported dynamically so browser bundles never execute
 * them.
 */
export const initNativePlatform = async (router: NativeRouter): Promise<void> => {
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
  let awake: boolean | undefined
  const applyKeepAwake = (pathname: string) => {
    const wanted = isFocusedShellPath(pathname)
    if (wanted === awake) return

    awake = wanted
    const call = wanted ? KeepAwake.keepAwake() : KeepAwake.allowSleep()
    call.catch((error: unknown) => console.warn('keep-awake unavailable', error))
    console.debug(`keep-awake ${wanted ? 'engaged' : 'released'}`)
  }

  applyKeepAwake(router.state.location.pathname)
  router.subscribe((state) => applyKeepAwake(state.location.pathname))

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

  // Universal Links (iOS), App Links (Android), and the getstronger:// scheme
  // all land here; hand the path to the router so verification and
  // password-reset emails open on the right view.
  await App.addListener('appUrlOpen', ({ url }) => {
    const path = deepLinkPath(url)
    if (path) void router.navigate(path)
  })

  // The splash screen stays up until the app has mounted (launchAutoHide is
  // off in capacitor.config.ts), so the user never sees an empty WebView.
  await SplashScreen.hide()
}
