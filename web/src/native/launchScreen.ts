import { Capacitor } from '@capacitor/core'

// The native launch screen is a still frame of the boot splash under a fully
// loaded bar, and `launchAutoHide` is off, so the app decides when to take it
// down. It used to come down once the app had mounted, which meant the native
// apps waited out every cold start on a picture of the bar while the web
// waited on the same bar loading itself. Handing over as soon as the splash is
// on screen puts the animation in front of the native wait too.

const takeDown = (): void => {
  if (!Capacitor.isNativePlatform()) return

  void import('@capacitor/splash-screen')
    .then(({ SplashScreen }) => SplashScreen.hide())
    .catch((error: unknown) => console.warn('splash screen unavailable', error))
}

/**
 * Hands the native launch screen over to the boot splash once that has faded
 * in.
 *
 * Both are the same lockup on the same canvas, so the swap itself is
 * invisible. Waiting for the fade rather than for the WebView's first paint is
 * what keeps the reveal's own delay from showing as a bare canvas.
 */
export const handOverLaunchScreen = (): void => {
  if (!Capacitor.isNativePlatform()) return

  const splash = document.getElementById('boot-splash')
  if (!splash) {
    takeDown()
    return
  }

  splash.addEventListener('animationend', (event) => {
    // The plates and the slogan bubble their own ends through here; the reveal
    // is the one that means the splash is visible.
    if (event.animationName === 'boot-reveal') takeDown()
  })
}

/**
 * Takes the launch screen down for a boot that beat the reveal.
 *
 * That boot removes the splash mid-fade, so the handover above never fires and
 * nothing else would.
 */
export const hideLaunchScreen = (): void => takeDown()
