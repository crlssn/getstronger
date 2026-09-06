import type { PropsWithChildren } from 'react'

import { NavigationType, useNavigationType } from 'react-router-dom'

import styles from './AppScreenTransition.module.css'

/**
 * Fades the screen in as navigation lands on it.
 *
 * The key is the path, so a new screen — and only a new screen — starts from
 * its first frame: a changed key remounts the wrapper, which is what replays
 * the animation, and a re-render on the same path leaves the settled screen
 * alone. The shells keep their chrome outside it, so the nav bars hold still
 * while the content between them changes.
 *
 * Going back is not an arrival. iOS's swipe-back has already dragged the
 * screen into view by the time the pop lands, so a fade here would flash it as
 * the peel finishes; the back chevron and Android's back gesture return to a
 * screen the user has already seen and read the same way.
 */
export const AppScreenTransition = ({
  transitionKey,
  children,
}: PropsWithChildren<{ transitionKey: string }>) => {
  const goingBack = useNavigationType() === NavigationType.Pop

  return (
    <div key={transitionKey} className={goingBack ? undefined : styles.screen}>
      {children}
    </div>
  )
}
