import { create } from 'zustand'

interface PageTitleState {
  /** The title a screen set for itself, in the language it was set in. */
  pageTitle: string
  /**
   * The catalogue key the route carries, when it carries one.
   *
   * The key rather than the string it resolves to: the language is chosen in
   * the settings and changes without a navigation, and a title resolved once
   * on arrival would keep naming the screen in the language it was opened in.
   */
  pageTitleKey: string
  /**
   * The screen the last navigation left behind, which is what names the back
   * row. Empty until there has been one.
   */
  previousPageTitle: string
  previousPageTitleKey: string
  /** A screen naming itself once it knows what it is about. */
  setPageTitle: (title: string) => void
  /** A navigation arriving, which is the only thing that moves the previous. */
  enterPage: (titleKey?: string) => void
}

export const usePageTitleStore = create<PageTitleState>()((set) => ({
  pageTitle: 'GetStronger',
  pageTitleKey: '',
  previousPageTitle: '',
  previousPageTitleKey: '',

  // A screen's own title is a name or a fetched string rather than a key, so
  // it clears the key the route arrived with.
  setPageTitle: (pageTitle) => set({ pageTitle, pageTitleKey: '' }),

  // Only a navigation moves it. A screen renaming itself — "View exercise"
  // becoming "Bench press" once the fetch lands — is the same page still, and
  // treating that as a departure would name the back row after the screen the
  // reader is looking at. A route with no key of its own arrives blank for the
  // screen to fill in, and a blank is not somewhere anybody has been.
  enterPage: (titleKey = '') =>
    set((state) => {
      const left = state.pageTitle || state.pageTitleKey
      return {
        pageTitle: '',
        pageTitleKey: titleKey,
        previousPageTitle: left ? state.pageTitle : state.previousPageTitle,
        previousPageTitleKey: left ? state.pageTitleKey : state.previousPageTitleKey,
      }
    }),
}))
