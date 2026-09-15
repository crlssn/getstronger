import { AppCard, AppStat } from 'getstronger-ds'

const row = { display: 'flex', gap: 24, alignItems: 'flex-start' } as const

export const ACardsHeadline = () => (
  <AppCard>
    <AppStat label="Total volume" value="7,240" unit="kg" />
  </AppCard>
)

export const AGridOfTiles = () => (
  <AppCard>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
      <AppStat size="md" label="Sets logged" value={18} />
      <AppStat size="md" label="Exercises" value={5} />
      <AppStat size="md" label="Duration" value={51} unit="min" />
      <AppStat size="md" label="Rest taken" value="12:30" />
    </div>
  </AppCard>
)

export const TheFigureAScreenIsBuiltAround = () => (
  <div style={row}>
    <AppStat size="xl" label="Pace now" value="5:24" unit="/km" />
    <AppStat size="xl" label="Distance" value="6.8" unit="km" />
  </div>
)

export const APersonalRecord = () => (
  <div style={row}>
    <AppStat label="Heaviest set" value="102.5" unit="kg" tone="record" />
    <AppStat label="Previous best" value="97.5" unit="kg" />
  </div>
)
