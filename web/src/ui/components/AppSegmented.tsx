import type { ReactNode } from 'react'

import { NavLink } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppSegmented.module.css'

export interface SegmentedOption<T> {
  label: string
  value: T
}

interface Props<T> {
  /** Names the group. Required — a row of unlabelled options says nothing. */
  label: string
  options: ReadonlyArray<SegmentedOption<T>>
  value: T
  onChange: (value: T) => void
  /** Numeric labels only — 7D, 4W, 1Y. Nothing long enough to need the room. */
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
}: Props<T>): ReactNode => (
  <div
    role="group"
    aria-label={label}
    className={cn(styles.segmented, density === 'compact' && styles.compact, className)}
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

export interface SegmentedLink {
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
export const AppSegmentedNav = ({ label, links, className }: NavProps) => (
  <nav aria-label={label} className={cn(styles.segmented, className)}>
    {links.map((link) => (
      <NavLink
        key={link.to}
        // Exact, because these are siblings: without it /users/1 would light up
        // alongside /users/1/followers, which is a prefix of it.
        end
        to={link.to}
        className={({ isActive }) => cn(isActive && styles.selected)}
      >
        {link.label}
      </NavLink>
    ))}
  </nav>
)
