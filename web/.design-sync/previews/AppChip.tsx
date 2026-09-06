import { AppCard, AppChip } from 'getstronger-ds'

// Chips are previewed on a card, which is the surface they sit on in the app —
// the neutral tone is a near-canvas tint and disappears against the canvas.
const row = { display: 'flex', gap: 8, alignItems: 'center', padding: 20 } as const

export const Tones = () => (
  <AppCard>
    <div style={row}>
      <AppChip>5 exercises</AppChip>
      <AppChip tone="record">PR</AppChip>
    </div>
  </AppCard>
)

export const BesideATitle = () => (
  <AppCard>
    <div style={row}>
      <strong style={{ fontSize: 17 }}>Bench press</strong>
      <AppChip tone="record">PR</AppChip>
    </div>
  </AppCard>
)

export const AsACount = () => (
  <AppCard>
    <div style={row}>
      <strong style={{ fontSize: 17 }}>Push day A</strong>
      <AppChip>5 exercises</AppChip>
    </div>
  </AppCard>
)
