import { useEffect } from 'react'

/**
 * Freezes the page where it stands, returning the release that thaws it.
 *
 * The body is taken out of flow at a matching offset rather than having its
 * overflow hidden: iOS and the WebView scroll a hidden-overflow page anyway,
 * which is the platform this app is read on.
 */
const freeze = () => {
  const { body } = document
  const offset = window.scrollY
  const { paddingRight, position, top, width } = body.style
  // Taking the body out of flow takes the scrollbar with it, and the page
  // would slide sideways by its width as the sheet opens.
  const gutter = window.innerWidth - document.documentElement.clientWidth

  body.style.position = 'fixed'
  body.style.top = `${-offset}px`
  body.style.width = '100%'
  if (gutter > 0) body.style.paddingRight = `${gutter}px`

  return () => {
    body.style.position = position
    body.style.top = top
    body.style.width = width
    body.style.paddingRight = paddingRight
    // A page that never left the top has nowhere to be put back to, and asking
    // anyway is a scroll the browser has to settle.
    if (offset > 0) window.scrollTo(0, offset)
  }
}

// Sheets stack — a confirm over a picker — and the second one reads a document
// already frozen at zero, so the page thaws with the last lock rather than the
// first.
let locks = 0
let thaw: (() => void) | undefined

/** Holds the page still while a modal is open, and puts the reader back. */
export const usePageScrollLock = () => {
  useEffect(() => {
    if (locks++ === 0) thaw = freeze()

    return () => {
      if (--locks > 0) return
      thaw?.()
      thaw = undefined
    }
  }, [])
}
