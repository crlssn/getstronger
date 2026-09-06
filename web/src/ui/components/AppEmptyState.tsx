import type { ReactNode } from 'react'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { AppSheet } from './AppSheet'
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
/**
 * The way out: a label, and a route if the action navigates.
 *
 * @public — part of the design system's exported surface, so a caller can name
 * the shape it is building. Nothing in the app imports it.
 */
export type EmptyStateAction = { label: string; to?: string }

/**
 * The concept behind the screen, for whoever wants it.
 *
 * @public — exported for the same reason as `EmptyStateAction`.
 */
export interface EmptyStateExplainer {
  label: string
  title: string
  children: ReactNode
}

interface Props {
  action: EmptyStateAction | 'none'
  title: string
  body?: string
  actionIcon?: ReactNode
  learnMore?: EmptyStateExplainer
  onAction?: () => void
}

/**
 * One shape for every empty state: a heading, a line, and a way out.
 *
 * No icon tile — the same grey rounded square appeared on every one of them,
 * so it distinguished nothing and cost 60px a screen. And no explainer in the
 * body: a three-step tour of what a plan is spent an entire 844px and pushed
 * its own button off the bottom. `learnMore` puts those words behind a link,
 * which a first-run reader opens once and a returning one never pays for.
 */
export const AppEmptyState = ({ action, title, body, actionIcon, learnMore, onAction }: Props) => {
  const { t } = useTranslation()
  const [explaining, setExplaining] = useState(false)

  return (
    <div className={styles.emptyState}>
      <h2>{title}</h2>
      {body && <p>{body}</p>}

      {(action !== 'none' || learnMore) && (
        <div className={styles.emptyActions}>
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

          {learnMore && (
            <button
              type="button"
              className={styles.emptyExplainer}
              onClick={() => setExplaining(true)}
            >
              {learnMore.label}
            </button>
          )}
        </div>
      )}

      {explaining && learnMore && (
        <AppSheet
          title={learnMore.title}
          closeLabel={t('common.close')}
          onClose={() => setExplaining(false)}
        >
          {learnMore.children}
        </AppSheet>
      )}
    </div>
  )
}
