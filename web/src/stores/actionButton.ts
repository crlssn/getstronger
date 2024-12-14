import { type FunctionalComponent, ref } from 'vue'
import { defineStore } from 'pinia'

export const useActionButton = defineStore('actionButton', () => {
  const a = ref(() => {})
  const i = ref<FunctionalComponent>()

  const set = (action: () => {}, icon: FunctionalComponent) => {
    a.value = action
    i.value = icon
  }

  const reset = () => {
    a.value = () => {}
    i.value = undefined
  }

  const active = () => {
    return a.value !== (() => {}) && i.value !== undefined
  }

  return { action: a, icon: i }
})
