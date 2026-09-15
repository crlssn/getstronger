/** Hears the native app leave for, and return from, the background. */
export type AppStateListener = (active: boolean) => void

const listeners = new Set<AppStateListener>()

/**
 * Subscribes to the native app moving between the foreground and background.
 *
 * The plugin listener is registered once by initNativePlatform, the single
 * place native wiring lives, so a store subscribes here and never imports
 * @capacitor/app itself: the browser bundle must keep not loading it. In a
 * browser nothing ever fires, and visibilitychange stays the right signal.
 */
export const subscribeAppState = (listener: AppStateListener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Hands a change from the plugin to every subscriber. */
export const appStateChanged = (active: boolean): void => {
  listeners.forEach((listener) => listener(active))
}
