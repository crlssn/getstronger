import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

interface NavTab {
  name: string
  href: string
}

export const useNavTabs = defineStore('navTabs', () => {
  const tabs = ref([] as NavTab[])

  const set = (t: NavTab[]) => {
    tabs.value = t
  }

  const reset = () => {
    tabs.value = [] as NavTab[]
  }

  const active = computed(() => {
    return tabs.value.length > 0
  })

  return { tabs, reset, active, set }
})
