import type { ComponentProps, ComponentType } from 'react'

import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppIconButton.module.css'

// Quiet by default, `raised` for the white square that reads as a control on
// its own, `strong` for an ink fill, `danger` for a destructive one. Same steps
// as AppButton's roles, minus the ones a bare icon cannot carry legibly.
export type IconButtonTone = 'default' | 'raised' | 'strong' | 'danger'

interface Shared {
  /** The button's accessible name. A bare icon has no other one. */
  label: string
  icon: ComponentType<ComponentProps<'svg'>>
  tone?: IconButtonTone
  /** `sm` is the 44px tap floor, `md` the 48px control height. */
  size?: 'sm' | 'md'
  className?: string
}

type LinkProps = Omit<ComponentProps<typeof Link>, 'className'> & Shared & { to: string }

type ButtonProps = Omit<ComponentProps<'button'>, 'className' | 'type'> &
  Shared & { to?: undefined }

/**
 * A button whose whole label is its icon.
 *
 * `label` is required rather than optional: a bare icon with no accessible
 * name is the single most common accessibility failure this app had, and a
 * required prop is the only version of the rule a screen cannot skip.
 */
export const AppIconButton = (props: LinkProps | ButtonProps) => {
  const { label, icon: Icon, tone = 'default', size = 'sm', className } = props
  const shape = cn(styles.iconButton, styles[tone], styles[size], className)

  if (props.to !== undefined) {
    const {
      label: _label,
      icon: _icon,
      tone: _tone,
      size: _size,
      className: _className,
      ...rest
    } = props
    return (
      <Link className={shape} aria-label={label} {...rest}>
        <Icon aria-hidden="true" />
      </Link>
    )
  }

  const {
    label: _label,
    icon: _icon,
    tone: _tone,
    size: _size,
    className: _className,
    to: _to,
    ...rest
  } = props
  return (
    <button type="button" className={shape} aria-label={label} {...rest}>
      <Icon aria-hidden="true" />
    </button>
  )
}
