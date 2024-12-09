import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Alert } from '@/types/alert'

export const useAlertStore = defineStore('alert', () => {
  const alert = ref<Alert | null>(null)
  const seen = ref(false)

  const set = (a: Alert) => {
    alert.value = a
    seen.value = false
  }

  const clear = () => {
    alert.value = null
    seen.value = false
  }

  const markSeen = () => {
    seen.value = true
  }

  return { alert, seen, set, clear, markSeen }
})
