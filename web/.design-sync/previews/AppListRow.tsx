import { AppList, AppListRow } from 'getstronger-ds'

export const WorkoutHistory = () => (
  <AppList>
    <AppListRow
      title="Push day A"
      meta="Fri 28 Aug · 51 min"
      trailing="7,240 kg"
      to="/workouts/1"
    />
    <AppListRow
      title="Pull day B"
      meta="Wed 26 Aug · 48 min"
      trailing="6,880 kg"
      to="/workouts/2"
    />
    <AppListRow title="Legs" meta="Mon 24 Aug · 62 min" trailing="9,410 kg" to="/workouts/3" />
  </AppList>
)

export const WithLeadingTile = () => (
  <AppList>
    <AppListRow
      leading={<span aria-hidden="true">🏆</span>}
      title="Bench press"
      meta="Personal record"
      trailing="102.5 kg × 5"
      to="/exercises/bench-press"
    />
    <AppListRow
      leading={<span aria-hidden="true">🏆</span>}
      title="Back squat"
      meta="Personal record"
      trailing="140 kg × 3"
      to="/exercises/back-squat"
    />
  </AppList>
)

export const WithoutLink = () => (
  <AppList>
    <AppListRow title="Total volume" meta="This week" trailing="23,530 kg" />
    <AppListRow title="Sessions" meta="This week" trailing="3" />
  </AppList>
)
