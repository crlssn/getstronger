import { AppList, AppListRow, AppUnreadDot } from 'getstronger-ds'

// The dot is decorative and three pixels across, so it is previewed where it is
// used: at the end of a row that has not been seen yet.
export const OnAnUnreadRow = () => (
  <AppList>
    <AppListRow
      title="Alex logged Push day A"
      meta="Just now"
      trailing={<AppUnreadDot />}
      to="/feed/1"
    />
    <AppListRow title="Sam logged Legs" meta="Yesterday" to="/feed/2" />
  </AppList>
)

export const Alone = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <AppUnreadDot />
    <span style={{ fontSize: 14, opacity: 0.7 }}>Unread</span>
  </div>
)
