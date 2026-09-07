import { Capacitor } from '@capacitor/core'

import type { AppTheme } from '@/theme'

/**
 * Turns the OS clock, signal and battery with the palette.
 *
 * The band they are drawn on is the app's own paper — `App.module.css` paints
 * it under the status bar — so the glyphs the system puts over it have to
 * follow the same palette or they vanish into it. Capacitor names a style
 * after the background it is for: Light is the dark clock a light palette
 * wants, Dark the light one. A no-op in a browser, where the OS draws nothing
 * over the page.
 */
export const paintStatusBar = (theme: AppTheme): void => {
  if (!Capacitor.isNativePlatform()) return

  void import('@capacitor/status-bar')
    .then(({ StatusBar, Style }) =>
      StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light }),
    )
    .catch((error: unknown) => {
      console.warn('status-bar unavailable', error)
    })
}
