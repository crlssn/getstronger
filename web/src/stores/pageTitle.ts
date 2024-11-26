import { defineStore } from 'pinia'
import { ref } from 'vue'

export const usePageTitleStore = defineStore('pageTitle', () => {
  const pageTitle = ref('GetStronger')
  const setPageTitle = (title: string) => {
    pageTitle.value = title
  }

  return { pageTitle, setPageTitle }
})
