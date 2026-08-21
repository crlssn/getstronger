import { create } from 'zustand'

interface ConnectionState {
  online: boolean
  reconnectCallbacks: Array<() => void>
  setOnline: (value: boolean) => void
  onReconnect: (callback: () => void) => void
  start: () => void
  stop: () => void
}

/**
 * Tracks whether the app can reach the backend. Browser online/offline events
 * set the baseline, and the transport layer corrects it from observed request
 * outcomes, since `navigator.onLine` only knows about the network interface.
 */
export const useConnectionStore = create<ConnectionState>()((set, get) => {
  const onBrowserOnline = () => get().setOnline(true)
  const onBrowserOffline = () => get().setOnline(false)

  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    reconnectCallbacks: [],

    setOnline: (value) => {
      const reconnected = !get().online && value
      set({ online: value })
      if (reconnected) get().reconnectCallbacks.forEach((callback) => callback())
    },

    /** Registers a callback to run every time connectivity returns. */
    onReconnect: (callback) => {
      set({ reconnectCallbacks: [...get().reconnectCallbacks, callback] })
    },

    start: () => {
      window.addEventListener('online', onBrowserOnline)
      window.addEventListener('offline', onBrowserOffline)
    },

    stop: () => {
      window.removeEventListener('online', onBrowserOnline)
      window.removeEventListener('offline', onBrowserOffline)
    },
  }
})
