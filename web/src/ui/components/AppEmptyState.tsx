import type { ReactNode } from 'react'

import { Link } from 'react-router-dom'

import styles from './AppEmptyState.module.css'

// Six dashed-border variants at three padding values and two backgrounds said
// the same thing six ways, and only one of them offered a way out.
//
// This is the one place in the design foundation where a component earns its
// keep over a CSS class, because the rule being enforced is editorial: always
// offer a next step. `action` is required — not required to exist, required to
// be decided. A screen with genuinely nowhere to go has to write action="none"
// in its own markup, where a reviewer will see the choice being made. A class
// cannot make anyone choose.
export type EmptyStateAction = { label: string; to?: string }

interface Props {
  action: EmptyStateAction | 'none'
  title: string
  body?: string
  icon?: ReactNode
  actionIcon?: ReactNode
  onAction?: () => void
}

export const AppEmptyState = ({ action, title, body, icon, actionIcon, onAction }: Props) => (
  <div className={styles.emptyState}>
    {icon && <span className={styles.emptyIcon}>{icon}</span>}
    <h2>{title}</h2>
    {body && <p>{body}</p>}

    {action !== 'none' &&
      (action.to ? (
        <Link to={action.to} className={styles.emptyAction}>
          {actionIcon}
          {action.label}
        </Link>
      ) : (
        <button type="button" className={styles.emptyAction} onClick={onAction}>
          {actionIcon}
          {action.label}
        </button>
      ))}
  </div>
)
