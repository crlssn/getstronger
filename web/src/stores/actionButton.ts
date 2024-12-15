import { computed, type FunctionalComponent, ref } from 'vue'
import { defineStore } from 'pinia'

interface Button {
  action: () => void
  icon: FunctionalComponent
}

export const useActionButton = defineStore('actionButton', () => {
  const a = ref(() => {})
  const i = ref<FunctionalComponent>()

  const set = (button: Button) => {
    a.value = button.action
    i.value = button.icon
  }

  const reset = () => {
    a.value = () => {}
    i.value = undefined
  }

  const active = computed(() => {
    return a.value !== (() => {}) && i.value !== undefined
  })

  return { action: a, icon: i, set, reset, active }
})
