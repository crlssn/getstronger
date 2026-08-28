import { create } from 'zustand'

interface PageTitleState {
  pageTitle: string
  /**
   * The screen the last navigation left behind, which is what names the back
   * row. Empty until there has been one.
   */
  previousPageTitle: string
  /** A screen naming itself once it knows what it is about. */
  setPageTitle: (title: string) => void
  /** A navigation arriving, which is the only thing that moves the previous. */
  enterPage: (title: string) => void
}

export const usePageTitleStore = create<PageTitleState>()((set) => ({
  pageTitle: 'GetStronger',
  previousPageTitle: '',
  setPageTitle: (pageTitle) => set({ pageTitle }),
  // Only a navigation moves it. A screen renaming itself — "View exercise"
  // becoming "Bench press" once the fetch lands — is the same page still, and
  // treating that as a departure would name the back row after the screen the
  // reader is looking at. A route with no key of its own arrives blank for the
  // screen to fill in, and a blank is not somewhere anybody has been.
  enterPage: (title) =>
    set((state) => ({
      pageTitle: title,
      previousPageTitle: state.pageTitle || state.previousPageTitle,
    })),
}))
