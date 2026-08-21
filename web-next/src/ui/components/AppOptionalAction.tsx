import { PlusIcon } from '@heroicons/react/24/outline'

import styles from './AppOptionalAction.module.css'

// One quiet affordance for every optional addition: findable when looked for,
// never competing with the page's primary action.
interface Props {
  label: string
  hint?: string
  onClick?: () => void
}

export const AppOptionalAction = ({ label, hint, onClick }: Props) => (
  <button type="button" className={styles.optionalAction} onClick={onClick}>
    <PlusIcon aria-hidden="true" />
    <span className={styles.copy}>
      <strong>{label}</strong>
      {hint && <small>{hint}</small>}
    </span>
  </button>
)
