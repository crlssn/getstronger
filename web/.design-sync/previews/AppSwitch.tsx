import { AppCard, AppSwitch } from 'getstronger-ds'

export const States = () => (
  <AppCard>
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 20 }}>
      <AppSwitch label="Rest timer" checked onChange={() => undefined} />
      <AppSwitch label="Keep the screen awake" checked={false} onChange={() => undefined} />
      <AppSwitch label="Public profile" checked disabled onChange={() => undefined} />
    </div>
  </AppCard>
)

export const On = () => <AppSwitch label="Rest timer" checked onChange={() => undefined} />

export const Off = () => <AppSwitch label="Rest timer" checked={false} onChange={() => undefined} />
