import { cn } from '@/ui/cn'
import styles from './AppEmptyInline.module.css'

interface Props {
  /** One line. A heading here would outrank the card's own. */
  children: string
  className?: string
}

/**
 * Nothing in this part of the screen yet, said in a line.
 *
 * The counterpart to `<AppEmptyState>`, and the difference is scope: that one
 * is the whole screen and always offers a way forward, this one is a section
 * of a screen that has plenty else on it. A card with content around it does
 * not need a heading and a button to say one list inside it is empty — five
 * screens said it five ways, from a bare "Nothing here yet…" row to a centred
 * two-line block.
 */
export const AppEmptyInline = ({ children, className }: Props) => (
  <p className={cn(styles.empty, className)}>{children}</p>
)
