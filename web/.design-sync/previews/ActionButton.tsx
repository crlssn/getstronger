import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ActionButton, AppPageHeader } from 'getstronger-ds'

export const Default = () => <ActionButton icon={PencilSquareIcon} action={() => undefined} />

// Where it is actually used: the one action a screen puts beside its title.
export const BesideAScreenTitle = () => (
  <AppPageHeader
    title="Push day A"
    lead="Five exercises, last done on Friday."
    action={<ActionButton icon={PencilSquareIcon} action={() => undefined} />}
  />
)
