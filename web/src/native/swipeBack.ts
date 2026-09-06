import { registerPlugin } from '@capacitor/core'

import { isFocusedShellPath } from '@/router/routes'
import { isTabRoot } from '@/router/tabs'

export interface SwipeBackPlugin {
  setEnabled: (options: { enabled: boolean }) => Promise<void>
}

/**
 * WKWebView's interactive back gesture, which only native code can switch on.
 *
 * iOS only — nothing answers the call on Android, which has a system back
 * gesture of its own. See mobile/ios/App/App/SwipeBackPlugin.swift.
 */
export const SwipeBack = registerPlugin<SwipeBackPlugin>('SwipeBack')

/**
 * Whether an edge swipe on this screen should walk history back.
 *
 * The gesture belongs to the screens the nav bar gives a back chevron: a tab
 * root would peel sideways into whichever tab was open before it, the focused
 * shell hides the way out of a workout on purpose, and the first entry of the
 * session has nothing but the blank document behind it.
 */
export const canSwipeBack = (pathname: string, historyIndex: number): boolean =>
  historyIndex > 0 && !isTabRoot(pathname) && !isFocusedShellPath(pathname)
