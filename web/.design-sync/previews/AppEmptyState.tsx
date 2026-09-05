import { AppEmptyState } from 'getstronger-ds'

export const WithAction = () => (
  <AppEmptyState
    title="No workouts yet"
    body="Start one from a routine, or log an empty session and add exercises as you go."
    action={{ label: 'Start a workout', to: '/workouts/new' }}
  />
)

export const NoWayForward = () => (
  <AppEmptyState
    title="Nothing to show for this week"
    body="Log a session and your volume will appear here."
    action="none"
  />
)

export const WithLearnMore = () => (
  <AppEmptyState
    title="No plans yet"
    body="A plan schedules the routines you already have."
    action={{ label: 'Create a plan', to: '/plans/new' }}
    learnMore={{
      label: 'What is a plan?',
      title: 'Plans',
      children: 'A plan puts your routines on a week, so the app knows what is next.',
    }}
  />
)
