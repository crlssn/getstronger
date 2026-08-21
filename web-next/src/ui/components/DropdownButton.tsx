import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { DropdownItem } from '@/types/dropdown'

export default function DropdownButton({
  items,
  label,
}: {
  items: DropdownItem[]
  label?: string
}) {
  const { t } = useTranslation()
  const menuLabel = label ?? t('workout.card.actionsAria')

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton
        aria-label={menuLabel}
        className="grid size-11 place-items-center rounded-control border border-border bg-white text-text-subtle transition hover:border-ink-border hover:bg-ink-surface hover:text-ink-strong [&>svg]:size-5"
      >
        <EllipsisHorizontalIcon />
      </MenuButton>
      <MenuItems
        transition
        className="absolute right-0 z-50 mt-2 w-48 origin-top-right scale-100 space-y-1 rounded-control border border-border bg-white p-1.5 opacity-100 shadow-overlay transition duration-100 ease-out focus:outline-none data-closed:scale-95 data-closed:opacity-0 data-leave:duration-75 data-leave:ease-in"
      >
        {items.map((item) =>
          item.href ? (
            <MenuItem key={item.title}>
              <Link
                to={item.href}
                className="flex min-h-(--size-control-sm) w-full items-center rounded-lg px-3 text-left text-sm font-medium text-text-muted data-focus:bg-ink-surface"
              >
                {item.title}
              </Link>
            </MenuItem>
          ) : (
            <MenuItem key={item.title}>
              <button
                type="button"
                onClick={item.func}
                className="flex min-h-(--size-control-sm) w-full items-center rounded-lg px-3 text-left text-sm font-medium text-danger data-focus:bg-danger-surface"
              >
                {item.title}
              </button>
            </MenuItem>
          ),
        )}
      </MenuItems>
    </Menu>
  )
}
