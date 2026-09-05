import { AppCard, AppDurationStepper } from 'getstronger-ds'

export const Default = () => (
  <AppDurationStepper label="Rest between sets" value={90} onChange={() => undefined} />
)

export const AtZero = () => (
  <AppDurationStepper label="Rest between sets" value={0} onChange={() => undefined} />
)

// The routine builder's real arrangement: the rest for one exercise.
export const OnARoutineRow = () => (
  <AppCard>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: 20,
      }}
    >
      <strong style={{ fontSize: 15 }}>Bench press</strong>
      <AppDurationStepper label="Rest between sets" value={150} onChange={() => undefined} />
    </div>
  </AppCard>
)
