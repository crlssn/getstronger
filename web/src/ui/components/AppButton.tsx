import type { ComponentProps } from 'react'

import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './AppButton.module.css'

// Four roles, not six colours: primary (ink fill), secondary (white with an
// ink border), ghost (text only) and destructive (danger text, never a red
// fill). Anything that wants "a bit of colour" has no name to reach for.
export type ButtonColour = 'primary' | 'secondary' | 'ghost' | 'destructive'

type LinkProps = Omit<ComponentProps<typeof Link>, 'className'> & {
  type: 'link'
  colour: ButtonColour
  className?: string
}

type ButtonProps = Omit<ComponentProps<'button'>, 'className' | 'type'> & {
  type: 'button' | 'submit'
  colour: ButtonColour
  className?: string
}

export const AppButton = (props: LinkProps | ButtonProps) => {
  if (props.type === 'link') {
    const { colour, className, type: _type, children, ...rest } = props
    return (
      <Link className={cn(styles.button, styles.link, styles[colour], className)} {...rest}>
        {children}
      </Link>
    )
  }

  const { colour, className, children, ...rest } = props
  return (
    <button className={cn(styles.button, styles[colour], className)} {...rest}>
      {children}
    </button>
  )
}
