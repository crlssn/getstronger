import { AppOptionalAction } from 'getstronger-ds'

export const Default = () => <AppOptionalAction label="Add a note" />

export const WithHint = () => (
  <AppOptionalAction label="Add a tag" hint="Group this exercise with others like it." />
)

export const Stacked = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <AppOptionalAction label="Add a note" />
    <AppOptionalAction label="Add an exercise" hint="Anything not in the routine yet." />
  </div>
)
