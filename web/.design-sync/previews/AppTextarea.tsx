import { AppTextarea } from 'getstronger-ds'

export const Default = () => (
  <AppTextarea
    placeholder="How did the session feel?"
    rows={4}
    defaultValue="Felt strong on the top set. Left shoulder a little tight on the last two."
  />
)

export const Empty = () => <AppTextarea placeholder="How did the session feel?" rows={4} />

export const Autosize = () => (
  <AppTextarea
    autosize
    placeholder="Notes"
    rows={2}
    defaultValue={
      'Warmed up with the empty bar for two sets.\nAdded 2.5 kg from last week.\nRest felt short on the final set.'
    }
  />
)
