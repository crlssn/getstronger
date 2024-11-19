import { ref } from 'vue'
import { defineStore } from 'pinia'

export const usePageTitleStore = defineStore(
  'pageTitle',
  () => {
    const pageTitle = ref('GetStronger')
    const setPageTitle = (title: string) =>{
      pageTitle.value = title
    }

    return { pageTitle, setPageTitle }
  },
)
