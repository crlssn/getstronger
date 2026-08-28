import { create } from 'zustand'

/**
 * How much of the bottom of the screen is already spoken for.
 *
 * Anything floating over the app — the toaster today — has to clear whatever
 * is pinned down there, and what that is changes by screen: the tab bar on
 * most of them, a form's action bar on a create or edit screen, neither on the
 * workout runner. The toast used to sit 0.75rem off the bottom edge regardless,
 * so it covered the tab bar on Exercises and the save on a routine.
 *
 * The pinned things register themselves rather than the toaster guessing from
 * the route: the form footer stands down while the keyboard is up, and a guess
 * would still be reserving room for it.
 */
interface BottomChromeState {
  /** Height in pixels, by the name of whatever pinned it. */
  pinned: Record<string, number>
  pin: (name: string, height: number) => void
  unpin: (name: string) => void
}

export const useBottomChrome = create<BottomChromeState>()((set) => ({
  pinned: {},
  pin: (name, height) => set((state) => ({ pinned: { ...state.pinned, [name]: height } })),
  unpin: (name) =>
    set((state) => {
      const { [name]: _removed, ...rest } = state.pinned
      return { pinned: rest }
    }),
}))

/** The tallest thing pinned to the bottom, which is what a floater clears. */
export const selectBottomChrome = (state: BottomChromeState) =>
  Math.max(0, ...Object.values(state.pinned))
