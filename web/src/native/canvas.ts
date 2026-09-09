import { Capacitor, registerPlugin } from '@capacitor/core'

import type { AppTheme } from '@/theme'

interface CanvasPlugin {
  setTheme: (options: { theme: AppTheme }) => Promise<void>
}

/**
 * The paper behind the WebView, which only native code can paint.
 *
 * iOS only — see mobile/ios/App/App/CanvasPlugin.swift.
 */
const Canvas = registerPlugin<CanvasPlugin>('Canvas')

/**
 * Paints what shows from behind the page in the palette the page is drawn in.
 *
 * The back-swipe peels the screen off the WebView's own background, and
 * Capacitor leaves that on the device's palette: a reader whose app is dark
 * and whose phone is not swipes onto white. The choice lives in the web app,
 * so the answer has to come from here. A no-op everywhere else — Android has
 * a system back gesture of its own, and a browser paints its own window.
 */
export const paintCanvas = (theme: AppTheme): void => {
  if (Capacitor.getPlatform() !== 'ios') return

  Canvas.setTheme({ theme }).catch((error: unknown) => {
    console.warn('canvas unavailable', error)
  })
}
