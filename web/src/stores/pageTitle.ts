import { create } from 'zustand'

/** A screen's name: its own string, or the catalogue key its route carries. */
export interface PageTitle {
  title: string
  key: string
}

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
  /** The history entry the last navigation landed on. */
  idx: number
  /**
   * Each history entry's title, by the index React Router gives it. A push
   * writes the next index, a replace rewrites the current one, and a pop only
   * reads, so the entry before this one is always the one back goes to.
   */
  titles: Record<number, PageTitle>
  /** A screen naming itself once it knows what it is about. */
  setPageTitle: (title: string) => void
  /** A navigation starting, before the history entry it lands on is known. */
  enterPage: (titleKey?: string) => void
  /** A navigation landing on history entry `idx`. */
  arrive: (idx: number) => void
}

export const usePageTitleStore = create<PageTitleState>()((set) => ({
  pageTitle: 'GetStronger',
  pageTitleKey: '',
  idx: 0,
  titles: {},

  // A screen's own title is a name or a fetched string rather than a key, so
  // it clears the key the route arrived with.
  setPageTitle: (pageTitle) =>
    set((state) => ({
      pageTitle,
      pageTitleKey: '',
      titles: { ...state.titles, [state.idx]: { title: pageTitle, key: '' } },
    })),

  // Not filed under an entry yet: a route loader calls this, and on a push the
  // browser is still on the entry being left.
  enterPage: (titleKey = '') => set({ pageTitle: '', pageTitleKey: titleKey }),

  arrive: (idx) =>
    set((state) => ({
      idx,
      titles: { ...state.titles, [idx]: { title: state.pageTitle, key: state.pageTitleKey } },
    })),
}))

/** The title of the entry back goes to, if one was recorded there. */
export const selectPreviousTitle = (state: PageTitleState): PageTitle | undefined =>
  state.titles[state.idx - 1]
