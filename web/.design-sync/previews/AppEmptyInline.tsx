import { AppCard, AppEmptyInline } from 'getstronger-ds'

export const InACard = () => (
  <AppCard>
    <div style={{ padding: 20 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 700 }}>Personal records</h2>
      <AppEmptyInline>No records set this month yet.</AppEmptyInline>
    </div>
  </AppCard>
)

export const Alone = () => <AppEmptyInline>Nothing logged for this exercise yet.</AppEmptyInline>
