import { PlusIcon } from '@heroicons/react/24/outline'
import { AppIconButton, AppPageHeader } from 'getstronger-ds'

export const Default = () => <AppPageHeader title="Workouts" />

export const WithEyebrowAndLead = () => (
  <AppPageHeader
    eyebrow="Progress"
    title="Bench press"
    lead="Every set you have logged for this exercise, heaviest first."
  />
)

export const WithAction = () => (
  <AppPageHeader
    title="Routines"
    lead="The sessions you start from."
    action={<AppIconButton label="New routine" icon={PlusIcon} tone="raised" />}
  />
)
