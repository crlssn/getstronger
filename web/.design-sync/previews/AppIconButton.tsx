import {
  BellIcon,
  EllipsisHorizontalIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { AppIconButton } from 'getstronger-ds'

export const Tones = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <AppIconButton label="Search exercises" icon={MagnifyingGlassIcon} />
    <AppIconButton label="Notifications" icon={BellIcon} tone="raised" />
    <AppIconButton label="Add exercise" icon={PlusIcon} tone="strong" />
    <AppIconButton label="Delete routine" icon={TrashIcon} tone="danger" />
  </div>
)

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <AppIconButton label="More" icon={EllipsisHorizontalIcon} tone="raised" size="sm" />
    <AppIconButton label="More" icon={EllipsisHorizontalIcon} tone="raised" size="md" />
  </div>
)

export const AsLink = () => (
  <AppIconButton
    label="Search exercises"
    icon={MagnifyingGlassIcon}
    tone="raised"
    to="/exercises"
  />
)
