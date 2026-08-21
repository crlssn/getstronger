import { create } from 'zustand'

interface PageNavActionState {
  /** The nav bar's action slot, or null while no nav bar is mounted. */
  container: HTMLElement | null
  setContainer: (container: HTMLElement | null) => void
}

/**
 * Where the top nav bar publishes its action slot for screens to portal into.
 *
 * The slot is an ancestor's DOM node, so a screen cannot find it during its own
 * first render. Publishing it from the bar's ref callback lets screens
 * subscribe instead of reaching into the document after mount.
 */
export const usePageNavActionStore = create<PageNavActionState>()((set) => ({
  container: null,
  setContainer: (container) => set({ container }),
}))

/** Passed straight to `ref`; React clears it with null when the bar unmounts. */
export const holdPageNavAction = (container: HTMLElement | null) => {
  usePageNavActionStore.getState().setContainer(container)
}
