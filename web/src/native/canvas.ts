import { Capacitor, registerPlugin } from '@capacitor/core'

import type { AppTheme } from '@/theme'

interface CanvasPlugin {
  setTheme: (options: { theme: AppTheme }) => Promise<void>
}

/**
 * The paper around the page, which only native code can paint.
 *
 * A plugin on each phone — mobile/ios/App/App/CanvasPlugin.swift and
 * mobile/android/app/src/main/java/studio/getstronger/app/CanvasPlugin.java.
 */
const Canvas = registerPlugin<CanvasPlugin>('Canvas')

/**
 * Paints what shows from outside the page in the palette the page is drawn in.
 *
 * On iOS that is the paper the back-swipe peels a screen off; on Android it is
 * the strips the status and navigation bars sit on. Both default to the
 * device's palette, so a reader whose app is dark and whose phone is not gets
 * white at one edge or another. The choice lives in the web app, so the answer
 * has to come from here. A no-op in a browser, which paints its own window.
 */
export const paintCanvas = (theme: AppTheme): void => {
  if (!Capacitor.isNativePlatform()) return

  Canvas.setTheme({ theme }).catch((error: unknown) => {
    console.warn('canvas unavailable', error)
  })
}
