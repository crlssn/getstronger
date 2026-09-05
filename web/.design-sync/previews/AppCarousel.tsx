import { AppCard, AppCarousel } from 'getstronger-ds'

const panel = (title: string, value: string, meta: string) => (
  <AppCard>
    <div style={{ padding: 20 }}>
      <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>{title}</p>
      <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>{value}</p>
      <p style={{ margin: '4px 0 0', fontSize: 13, opacity: 0.7 }}>{meta}</p>
    </div>
  </AppCard>
)

export const Default = () => (
  <AppCarousel
    label="This week's totals"
    slides={[
      {
        key: 'volume',
        label: 'Volume',
        content: panel('Volume', '23,530 kg', 'Up 12% on last week'),
      },
      {
        key: 'sessions',
        label: 'Sessions',
        content: panel('Sessions', '3', 'One left to hit your plan'),
      },
      {
        key: 'records',
        label: 'Records',
        content: panel('Records', '2', 'Bench press and back squat'),
      },
    ]}
  />
)

export const TwoPanels = () => (
  <AppCarousel
    label="Personal records"
    slides={[
      {
        key: 'bench',
        label: 'Bench press',
        content: panel('Bench press', '102.5 kg', 'Set on Friday'),
      },
      {
        key: 'squat',
        label: 'Back squat',
        content: panel('Back squat', '140 kg', 'Set three weeks ago'),
      },
    ]}
  />
)
