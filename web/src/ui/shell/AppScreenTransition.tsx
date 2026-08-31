import type { PropsWithChildren } from 'react'

import styles from './AppScreenTransition.module.css'

/**
 * Fades the screen in as navigation lands on it.
 *
 * The key is the path, so a new screen — and only a new screen — starts from
 * its first frame: a changed key remounts the wrapper, which is what replays
 * the animation, and a re-render on the same path leaves the settled screen
 * alone. The shells keep their chrome outside it, so the nav bars hold still
 * while the content between them changes.
 */
export const AppScreenTransition = ({
  transitionKey,
  children,
}: PropsWithChildren<{ transitionKey: string }>) => (
  <div key={transitionKey} className={styles.screen}>
    {children}
  </div>
)
