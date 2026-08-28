import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

const subscribe = (onChange: () => void) => {
  // jsdom has no matchMedia, and a spec that renders a chart is not asking
  // about motion.
  const list = window.matchMedia?.(query)
  list?.addEventListener('change', onChange)
  return () => list?.removeEventListener('change', onChange)
}

/**
 * Whether the reader has asked for less movement.
 *
 * The app already answers this in CSS — the toaster, the rest banner, the boot
 * splash — but a chart animates on a canvas, which no media query reaches. Both
 * charts grow out of the axis over a second on every mount, and that is a
 * second of movement nobody asked for on the two screens that exist to be read
 * rather than watched.
 */
export const usePrefersReducedMotion = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  )
