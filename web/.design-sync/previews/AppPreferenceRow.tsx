import { AppCard, AppPreferenceRow, AppSegmented, AppSwitch } from 'getstronger-ds'

export const WithASwitch = () => (
  <AppCard>
    <AppPreferenceRow
      title="Rest timer"
      body="Start a countdown the moment a set is logged."
      control={<AppSwitch label="Rest timer" checked onChange={() => undefined} />}
    />
  </AppCard>
)

export const WithASegmented = () => (
  <AppCard>
    <AppPreferenceRow
      title="Weight unit"
      body="How every set is shown and logged."
      control={
        <AppSegmented
          label="Weight unit"
          density="compact"
          value="kg"
          options={[
            { label: 'kg', value: 'kg' },
            { label: 'lb', value: 'lb' },
          ]}
          onChange={() => undefined}
        />
      }
    />
  </AppCard>
)

export const WithAnError = () => (
  <AppCard>
    <AppPreferenceRow
      title="Public profile"
      body="Anyone can see the workouts you have logged."
      error="That did not save. Check your connection."
      control={<AppSwitch label="Public profile" checked={false} onChange={() => undefined} />}
    />
  </AppCard>
)

export const Several = () => (
  <AppCard>
    <AppPreferenceRow
      title="Rest timer"
      body="Start a countdown the moment a set is logged."
      control={<AppSwitch label="Rest timer" checked onChange={() => undefined} />}
    />
    <AppPreferenceRow
      title="Keep the screen awake"
      body="While a workout is running."
      control={
        <AppSwitch label="Keep the screen awake" checked={false} onChange={() => undefined} />
      }
    />
  </AppCard>
)
