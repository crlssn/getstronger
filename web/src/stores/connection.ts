import { ref } from 'vue'
import { defineStore } from 'pinia'

/**
 * Tracks whether the app can reach the backend. Browser online/offline events
 * set the baseline, and the transport layer corrects it from observed request
 * outcomes, since `navigator.onLine` only knows about the network interface.
 */
export const useConnectionStore = defineStore('connection', () => {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const reconnectCallbacks: Array<() => void> = []

  const setOnline = (value: boolean) => {
    const reconnected = !online.value && value
    online.value = value
    if (reconnected) reconnectCallbacks.forEach((callback) => callback())
  }

  /** Registers a callback to run every time connectivity returns. */
  const onReconnect = (callback: () => void) => {
    reconnectCallbacks.push(callback)
  }

  const onBrowserOnline = () => setOnline(true)
  const onBrowserOffline = () => setOnline(false)

  const start = () => {
    window.addEventListener('online', onBrowserOnline)
    window.addEventListener('offline', onBrowserOffline)
  }

  const stop = () => {
    window.removeEventListener('online', onBrowserOnline)
    window.removeEventListener('offline', onBrowserOffline)
  }

  return { online, onReconnect, setOnline, start, stop }
})
