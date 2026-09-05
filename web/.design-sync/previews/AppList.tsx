import { AppList, AppListItem, AppListRow } from 'getstronger-ds'

export const OfRows = () => (
  <AppList>
    <AppListRow title="Bench press" meta="Chest · Weight × reps" to="/exercises/1" />
    <AppListRow title="Back squat" meta="Legs · Weight × reps" to="/exercises/2" />
    <AppListRow title="Deadlift" meta="Back · Weight × reps" to="/exercises/3" />
  </AppList>
)

export const OfItems = () => (
  <AppList>
    <AppListItem is="header">This week</AppListItem>
    <AppListItem>Push day A</AppListItem>
    <AppListItem>Pull day B</AppListItem>
  </AppList>
)

// canFetch adds the sentinel row that pulls the next page in on scroll.
export const Fetching = () => (
  <AppList canFetch onFetch={() => undefined}>
    <AppListRow title="Bench press" meta="Chest · Weight × reps" to="/exercises/1" />
    <AppListRow title="Back squat" meta="Legs · Weight × reps" to="/exercises/2" />
  </AppList>
)
