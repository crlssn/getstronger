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
    set('success', message)
  }

  const setError = (message: string) => {
    set('error', message)
  }

  const set = (type: 'error'|'success', message: string) => {
    alert.value = {
      message: message,
      seen: false,
      type: type,
    } as Alert
  }

  return { alert, clear, markSeen, setError, setSuccess }
})
