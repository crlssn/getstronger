/**
 * The two palettes the app can be drawn in.
 *
 * The values live in assets/theme.css as role tokens; all the code carries is
 * which block of them is active, as `data-theme` on the root element. The
 * boot script in index.html mirrors `applyTheme` so the first paint is already
 * in the right palette; `stores/locale.ts` owns the choice from then on.
 */
export type AppTheme = 'dark' | 'light'

/** The catalogue key naming each palette, shared by the picker and the
 *  profile row so the two never disagree on what a mode is called. */
export const themeLabelKey: Record<AppTheme, string> = {
  dark: 'settings.appearanceDark',
  light: 'settings.appearanceLight',
}

/** What the device asks for right now. Specs run in a jsdom without matchMedia. */
export const deviceTheme = (): AppTheme =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'

/** Paints the app in a palette. `data-theme` carries it to every token. */
export const applyTheme = (theme: AppTheme): void => {
  document.documentElement.dataset.theme = theme
}
