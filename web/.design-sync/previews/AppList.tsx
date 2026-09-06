import { AppList, AppListRow } from 'getstronger-ds'

export const OfRows = () => (
  <AppList>
    <AppListRow title="Bench press" meta="Chest · Weight × reps" to="/exercises/1" />
    <AppListRow title="Back squat" meta="Legs · Weight × reps" to="/exercises/2" />
    <AppListRow title="Deadlift" meta="Back · Weight × reps" to="/exercises/3" />
  </AppList>
)

// The heading is the section label and the list's accessible name at once.
export const WithHeading = () => (
  <AppList heading="This week">
    <AppListRow title="Push day A" meta="Fri 28 Aug · 51 min" trailing="7,240 kg" />
    <AppListRow title="Pull day B" meta="Wed 26 Aug · 48 min" trailing="6,880 kg" />
  </AppList>
)

// canFetch adds the sentinel row that pulls the next page in on scroll.
export const Fetching = () => (
  <AppList canFetch onFetch={() => undefined}>
    <AppListRow title="Bench press" meta="Chest · Weight × reps" to="/exercises/1" />
    <AppListRow title="Back squat" meta="Legs · Weight × reps" to="/exercises/2" />
  </AppList>
)
