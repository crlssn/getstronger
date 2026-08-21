import { create } from 'zustand'

export interface NavTab {
  name: string
  href: string
}

interface NavTabsState {
  tabs: NavTab[]
  set: (tabs: NavTab[]) => void
  reset: () => void
}

export const selectNavTabsActive = (state: NavTabsState) => state.tabs.length > 0

export const useNavTabs = create<NavTabsState>()((set) => ({
  tabs: [],
  set: (tabs) => set({ tabs }),
  reset: () => set({ tabs: [] }),
}))
