import { AppList, AppListItem, AppListItemLink } from 'getstronger-ds'

// Deprecated: new work uses AppList + AppListRow. Kept until the removal release.

export const Default = () => (
  <AppList>
    <AppListItemLink to="/settings/account">Account</AppListItemLink>
    <AppListItemLink to="/settings/units">Units</AppListItemLink>
    <AppListItemLink to="/settings/notifications">Notifications</AppListItemLink>
  </AppList>
)

export const BesideAPlainItem = () => (
  <AppList>
    <AppListItem is="header">Settings</AppListItem>
    <AppListItemLink to="/settings/account">Account</AppListItemLink>
    <AppListItem>Version 1.4.0</AppListItem>
  </AppList>
)
