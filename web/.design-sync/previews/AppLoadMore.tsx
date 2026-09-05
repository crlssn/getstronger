import { AppList, AppListRow, AppLoadMore } from 'getstronger-ds'

export const UnderAList = () => (
  <>
    <AppList>
      <AppListRow title="Push day A" meta="Fri 28 Aug · 51 min" trailing="7,240 kg" to="/w/1" />
      <AppListRow title="Pull day B" meta="Wed 26 Aug · 48 min" trailing="6,880 kg" to="/w/2" />
    </AppList>
    <AppLoadMore label="Show more workouts" onFetch={() => undefined} />
  </>
)

export const Default = () => <AppLoadMore label="Show more workouts" onFetch={() => undefined} />

// Busy is a cursor and a half-step of grey, so this reads almost the same as
// Default by design — recorded as a known render warn rather than a fault.
export const Loading = () => (
  <AppLoadMore label="Show more workouts" loading onFetch={() => undefined} />
)
