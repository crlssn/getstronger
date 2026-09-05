import { AppSegmentedNav } from 'getstronger-ds'

// Each option is its own route; the router decides which one is selected, so
// the preview sits at "/" and the first link is the active one.
export const Default = () => (
  <AppSegmentedNav
    label="Profile sections"
    links={[
      { label: 'Workouts', to: '/' },
      { label: 'Following', to: '/following' },
      { label: 'Followers', to: '/followers' },
    ]}
  />
)
