import { cn } from '@/ui/cn'
import styles from './AppSwitch.module.css'

interface Props {
  /** The switch's accessible name. A track and a knob have no other one. */
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

/** On or off, decided the moment it is tapped. */
export const AppSwitch = ({ label, checked, onChange, disabled, className }: Props) => (
  <button
    type="button"
    role="switch"
    className={cn(styles.switch, className)}
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.knob} />
  </button>
)
