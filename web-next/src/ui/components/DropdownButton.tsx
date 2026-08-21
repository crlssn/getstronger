import type { DropdownItem } from '@/types/dropdown'

import { Menu, MenuButton, MenuItem, MenuItems, Transition } from '@headlessui/react'
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { cn } from '@/ui/cn'
import styles from './DropdownButton.module.css'

interface Props {
  items: DropdownItem[]
  label?: string
}

export const DropdownButton = ({ items, label }: Props) => {
  const { t } = useTranslation()

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        className={styles.menuTrigger}
        aria-label={label ?? t('workout.card.actionsAria')}
      >
        <EllipsisHorizontalIcon aria-hidden="true" />
      </MenuButton>

      <Transition
        enter={styles.enter}
        enterFrom={styles.enterFrom}
        enterTo={styles.enterTo}
        leave={styles.leave}
        leaveFrom={styles.enterTo}
        leaveTo={styles.enterFrom}
      >
        <MenuItems className={styles.menuItems}>
          {items.map((item) => (
            <MenuItem key={item.title}>
              {({ focus }) =>
                item.href ? (
                  <Link to={item.href} className={cn(styles.menuItem, focus && styles.active)}>
                    {item.title}
                  </Link>
                ) : (
                  // An item that acts rather than navigates is destructive:
                  // every one of them today is a delete.
                  <button
                    type="button"
                    className={cn(styles.menuItem, styles.danger, focus && styles.active)}
                    onClick={() => void item.func?.()}
                  >
                    {item.title}
                  </button>
                )
              }
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  )
}
