import type { ReactNode } from 'react'

import { useRef } from 'react'
import { NavLink } from 'react-router-dom'

import { cn } from '@/ui/cn'
import { useOverflowEdges } from '@/utils/useOverflowEdges'
import styles from './AppSegmented.module.css'

/**
 * Fades whichever edge is hiding options.
 *
 * The row already scrolled, but it ended flush at its container: "Distance ×
 * time | Re…" read as a rendering fault rather than as something to swipe.
 */
const edgeClasses = (edges: { start: boolean; end: boolean }) => [
  edges.start && styles.fadeStart,
  edges.end && styles.fadeEnd,
]

interface SegmentedOption<T> {
  label: string
  value: T
}

interface Props<T> {
  /** Names the group. Required — a row of unlabelled options says nothing. */
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /**
   * Short labels only — 7D, 4W, 1Y, or a switch sharing a row with a title.
   *
   * Nothing long enough to need the room it gives up.
   */
  density?: 'default' | 'compact'
  /** Locks the control while the choice is being saved. */
  busy?: boolean
  className?: string
}

/**
 * Pick one of these.
 *
 * The app had six of these — three track treatments, four selected states and
 * four radii — before a global `.segmented` class collapsed them into one. This
 * is that class with the markup it always implied: a labelled group, and an
 * `aria-pressed` on each option rather than a class that only reads visually.
 */
export const AppSegmented = <T,>({
  label,
  options,
  value,
  onChange,
  density = 'default',
  busy = false,
  className,
}: Props<T>): ReactNode => {
  const track = useRef<HTMLDivElement>(null)
  const edges = useOverflowEdges(track)

  return (
    <div
      ref={track}
      role="group"
      aria-label={label}
      className={cn(
        styles.segmented,
        density === 'compact' && styles.compact,
        ...edgeClasses(edges),
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          className={cn(option.value === value && styles.selected)}
          aria-pressed={option.value === value}
          disabled={busy}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

interface SegmentedLink {
  label: string
  to: string
}

interface NavProps {
  label: string
  links: readonly SegmentedLink[]
  className?: string
}

/**
 * The same control, where each option is its own page.
 *
 * Routed rather than local state, so a tab is addressable and the browser's
 * back button means what the user expects.
 */
export const AppSegmentedNav = ({ label, links, className }: NavProps) => {
  const track = useRef<HTMLElement>(null)
  const edges = useOverflowEdges(track)

  return (
    <nav
      ref={track}
      aria-label={label}
      className={cn(styles.segmented, ...edgeClasses(edges), className)}
    >
      {links.map((link) => (
        <NavLink
          key={link.to}
          // Exact, because these are siblings: without it /users/1 would light
          // up alongside /users/1/followers, which is a prefix of it.
          end
          to={link.to}
          className={({ isActive }) => cn(isActive && styles.selected)}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  )
}
