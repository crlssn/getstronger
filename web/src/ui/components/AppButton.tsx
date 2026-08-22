import type { ComponentProps } from 'react'

import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppButton.module.css'

// Four roles, not six colours: primary (ink fill), secondary (white with an
// ink border), ghost (text only) and destructive (danger text, never a red
// fill). Anything that wants "a bit of colour" has no name to reach for.
export type ButtonColour = 'primary' | 'secondary' | 'ghost' | 'destructive'

// The control scale, not a set of paddings: sm is the tap-target floor, lg is
// what a form's submit uses. There is nothing below sm on purpose.
export type ButtonSize = 'sm' | 'md' | 'lg'

interface Shared {
  colour: ButtonColour
  size?: ButtonSize
  /** Most buttons fill their column; `auto` shrinks one to its content. */
  width?: 'full' | 'auto'
  className?: string
}

type LinkProps = Omit<ComponentProps<typeof Link>, 'className'> & Shared & { type: 'link' }

type ButtonProps = Omit<ComponentProps<'button'>, 'className' | 'type'> &
  Shared & { type: 'button' | 'submit' }

export const AppButton = (props: LinkProps | ButtonProps) => {
  const { colour, size = 'md', width = 'full', className } = props
  const shape = cn(styles.button, styles[colour], styles[size], width === 'full' && styles.full)

  if (props.type === 'link') {
    const {
      colour: _colour,
      size: _size,
      width: _width,
      className: _className,
      type: _type,
      children,
      ...rest
    } = props
    return (
      <Link className={cn(shape, styles.link, className)} {...rest}>
        {children}
      </Link>
    )
  }

  const {
    colour: _colour,
    size: _size,
    width: _width,
    className: _className,
    children,
    ...rest
  } = props
  return (
    <button className={cn(shape, className)} {...rest}>
      {children}
    </button>
  )
}
