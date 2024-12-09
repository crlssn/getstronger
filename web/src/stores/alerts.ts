import type { Alert } from '@/types/alert'

import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAlertStore = defineStore('alert', () => {
  const alert = ref<Alert | null>(null)

  const clear = () => {
    alert.value = null
  }

  const markSeen = () => {
    if (alert.value) {
      alert.value.seen = true
    }
  }

  const setSuccess = (message: string) => {
    set('success', message, false)
  }

  const setError = (message: string) => {
    set('error', message, false)
  }

  const setSuccessWithoutPageRefresh = (message: string) => {
    set('success', message, true)
  }

  const setErrorWithoutPageRefresh = (message: string) => {
    set('error', message, true)
  }

  const set = (type: 'error'|'success', message: string, seen: boolean) => {
    alert.value = {
      message: message,
      seen: seen,
      type: type,
    } as Alert
  }

  return { alert, clear, markSeen, setError, setSuccess, setErrorWithoutPageRefresh, setSuccessWithoutPageRefresh }
})
