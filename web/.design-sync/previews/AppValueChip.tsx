import { AppCard, AppValueChip } from 'getstronger-ds'

// Previewed on a card: the collapsed pill is a near-canvas tint and vanishes
// against the canvas, and the routine builder always shows it on a row.
const row = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 20,
} as const

export const Collapsed = () => (
  <AppCard>
    <div style={row}>
      <strong style={{ fontSize: 15 }}>Bench press</strong>
      <AppValueChip label="Rest between sets" value="1:30" onClick={() => undefined} />
    </div>
  </AppCard>
)

export const Expanded = () => (
  <AppCard>
    <div style={row}>
      <strong style={{ fontSize: 15 }}>Bench press</strong>
      <AppValueChip label="Rest between sets" value="1:30" expanded onClick={() => undefined} />
    </div>
  </AppCard>
)

export const WithCaption = () => (
  <AppCard>
    <div style={row}>
      <strong style={{ fontSize: 15 }}>Back squat</strong>
      <span style={{ display: 'flex', gap: 8 }}>
        <AppValueChip
          label="Rest between sets"
          caption="Sets"
          value="1:30"
          onClick={() => undefined}
        />
        <AppValueChip
          label="Rest after the exercise"
          caption="After"
          value="2:00"
          onClick={() => undefined}
        />
      </span>
    </div>
  </AppCard>
)
