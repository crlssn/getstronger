import { AppList, AppListItem } from 'getstronger-ds'

export const Kinds = () => (
  <AppList>
    <AppListItem is="header">Danger zone</AppListItem>
    <AppListItem>Export your data</AppListItem>
    <AppListItem is="danger">Delete this routine</AppListItem>
  </AppList>
)

export const Plain = () => (
  <AppList>
    <AppListItem>Bench press</AppListItem>
    <AppListItem>Overhead press</AppListItem>
    <AppListItem>Dips</AppListItem>
  </AppList>
)
