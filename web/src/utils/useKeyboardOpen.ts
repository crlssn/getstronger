import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'

/** How much height the window loses before only a keyboard explains it. */
const keyboardMinimumHeight = 150

type Report = (open: boolean) => void

/**
 * A browser fires no event for the keyboard, so it is inferred from the visual
 * viewport losing height that the layout viewport keeps. Anything without a
 * visual viewport — every desktop browser — reports it closed, which is the
 * honest answer there.
 */
const watchViewport = (report: Report) => {
  const viewport = window.visualViewport
  if (!viewport) return

  const read = () => report(window.innerHeight - viewport.height > keyboardMinimumHeight)

  read()
  viewport.addEventListener('resize', read)
  return () => viewport.removeEventListener('resize', read)
}

/**
 * The native WebView is resized to the room above the keyboard, so the layout
 * viewport shrinks with the visual one and the inference above never fires.
 * The plugin announces the keyboard outright. It is imported on demand, the
 * way the rest of `native/` does, so a browser bundle never loads it.
 */
const watchPlugin = (report: Report) => {
  const listening = import('@capacitor/keyboard')
    .then(({ Keyboard }) =>
      Promise.all([
        Keyboard.addListener('keyboardWillShow', () => report(true)),
        Keyboard.addListener('keyboardWillHide', () => report(false)),
      ]),
    )
    .catch((error: unknown) => {
      console.warn('keyboard unavailable', error)
      return []
    })

  // The listeners may still be arriving when the unmount comes, so the removal
  // waits for them rather than missing them.
  return () => void listening.then((handles) => handles.forEach((handle) => void handle.remove()))
}

/** Whether the on-screen keyboard is covering the bottom of the window. */
export const useKeyboardOpen = (): boolean => {
  const [open, setOpen] = useState(false)

  useEffect(
    () => (Capacitor.isNativePlatform() ? watchPlugin(setOpen) : watchViewport(setOpen)),
    [],
  )

  return open
}
