import { AppNumberField } from 'getstronger-ds'

export const WithUnit = () => (
  <AppNumberField value={102.5} unit="kg" inputMode="decimal" onChange={() => undefined} />
)

export const Reps = () => (
  <AppNumberField value={5} inputMode="numeric" onChange={() => undefined} />
)

export const Empty = () => (
  <AppNumberField value={undefined} unit="kg" inputMode="decimal" onChange={() => undefined} />
)

// How a set is actually logged: a weight and a rep count side by side.
export const ASetRow = () => (
  <div style={{ display: 'flex', gap: 12 }}>
    <AppNumberField value={102.5} unit="kg" inputMode="decimal" onChange={() => undefined} />
    <AppNumberField value={5} inputMode="numeric" onChange={() => undefined} />
  </div>
)
