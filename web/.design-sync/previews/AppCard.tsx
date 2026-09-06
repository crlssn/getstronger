import { AppCard } from 'getstronger-ds'

export const Default = () => (
  <AppCard>
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Push day A</h2>
      <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.7 }}>
        Bench press, overhead press, dips — 5 exercises.
      </p>
    </div>
  </AppCard>
)

export const Stacked = () => (
  <>
    <AppCard>
      <div style={{ padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>This week</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.7 }}>3 sessions · 23,530 kg</p>
      </div>
    </AppCard>
    <AppCard>
      <div style={{ padding: 20 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Last week</h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, opacity: 0.7 }}>4 sessions · 31,180 kg</p>
      </div>
    </AppCard>
  </>
)
