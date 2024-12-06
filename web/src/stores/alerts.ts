import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useAlertStore = defineStore('alert', () => {
  const alert = ref('')

  const set = (message: string) => {
    alert.value = message
  }

  return { alert, set }
})
