import type { Alert } from '@/types/alert'

import { create } from 'zustand'

interface AlertState {
  alert: Alert | null
  clear: () => void
  markSeen: () => void
  setSuccess: (message: string) => void
  setError: (message: string) => void
  setSuccessWithoutPageRefresh: (message: string) => void
  setErrorWithoutPageRefresh: (message: string) => void
}

export const useAlertStore = create<AlertState>()((set, get) => {
  const setAlert = (type: Alert['type'], message: string, seen: boolean) => {
    set({ alert: { message, seen, type } })
  }

  return {
    alert: null,

    clear: () => set({ alert: null }),

    markSeen: () => {
      const { alert } = get()
      if (alert) set({ alert: { ...alert, seen: true } })
    },

    setSuccess: (message) => setAlert('success', message, false),
    setError: (message) => setAlert('error', message, false),
    setSuccessWithoutPageRefresh: (message) => setAlert('success', message, true),
    setErrorWithoutPageRefresh: (message) => setAlert('error', message, true),
  }
})
