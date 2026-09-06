import { CheckIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { AppOptionRow } from 'getstronger-ds'

export const Default = () => (
  <AppOptionRow trailing={<ChevronRightIcon width={20} aria-hidden="true" />}>
    Pick an exercise
  </AppOptionRow>
)

export const Selected = () => (
  <div style={{ display: 'grid', gap: 8 }}>
    <AppOptionRow selected trailing={<CheckIcon width={20} aria-hidden="true" />}>
      Kilograms
    </AppOptionRow>
    <AppOptionRow>Pounds</AppOptionRow>
  </div>
)

export const WithLeading = () => (
  <AppOptionRow
    leading={<span aria-hidden="true">🏋️</span>}
    trailing={<ChevronRightIcon width={20} aria-hidden="true" />}
  >
    Bench press
  </AppOptionRow>
)

// `flat` drops the border for a row inside an already-divided list.
export const Flat = () => (
  <div style={{ display: 'grid' }}>
    <AppOptionRow flat>Bench press</AppOptionRow>
    <AppOptionRow flat>Overhead press</AppOptionRow>
    <AppOptionRow flat>Dips</AppOptionRow>
  </div>
)
