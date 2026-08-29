import type { Toast } from '@/types/toast'

import { create } from 'zustand'

/** How long a toast stays on screen before it dismisses itself. */
export const TOAST_DURATION_MS = 3000

interface ToastState {
  toast: Toast | null
  success: (message: string) => void
  dismiss: () => void
}

// The clock lives beside the store rather than in it: a timeout handle is not
// state anything renders, and keeping it out means `toast` stays comparable.
let clock: ReturnType<typeof setTimeout> | undefined

const stopClock = () => {
  clearTimeout(clock)
  clock = undefined
}

let lastID = 0

/**
 * The transient success message shown over the app, one at a time.
 *
 * Success only: an error stays inline beside the action that raised it, where
 * it can be corrected, so this store has nothing else to say. It dismisses
 * itself, so a message raised just before a navigation is still readable on
 * the screen that follows without anything counting route changes. The newest
 * message wins: two of them stacked would cover the screen a phone has little
 * of, and the later one is the one the user just caused.
 */
export const useToastStore = create<ToastState>()((set, get) => ({
  toast: null,

  success: (message) => {
    const current = get().toast
    // Effects run twice under StrictMode: a repeat restarts the clock rather
    // than announcing again.
    const repeat = current?.message === message

    stopClock()
    if (!repeat) {
      lastID += 1
      set({ toast: { id: lastID, message } })
    }
    clock = setTimeout(() => get().dismiss(), TOAST_DURATION_MS)
  },

  dismiss: () => {
    stopClock()
    set({ toast: null })
  },
}))
