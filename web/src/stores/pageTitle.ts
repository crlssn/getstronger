import { create } from 'zustand'

interface PageTitleState {
  pageTitle: string
  setPageTitle: (title: string) => void
}

export const usePageTitleStore = create<PageTitleState>()((set) => ({
  pageTitle: 'GetStronger',
  setPageTitle: (pageTitle) => set({ pageTitle }),
}))
