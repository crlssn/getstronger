import { AppErrorState } from 'getstronger-ds'

export const Default = () => <AppErrorState onRetry={() => undefined} />

export const WithOwnWords = () => (
  <AppErrorState
    title="Could not load your workouts"
    body="That did not load. Check your connection and try again."
    onRetry={() => undefined}
  />
)

export const Compact = () => (
  <AppErrorState compact title="Could not load more" onRetry={() => undefined} />
)
