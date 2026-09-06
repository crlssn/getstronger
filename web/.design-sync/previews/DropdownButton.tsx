import { AppCard, DropdownButton } from 'getstronger-ds'

// The menu opens on a click, which a static card cannot make, so these show the
// trigger in the positions the app uses it.
export const Trigger = () => (
  <DropdownButton
    label="Workout actions"
    items={[
      { title: 'Edit this workout', href: '/workouts/1/edit' },
      { title: 'Delete this workout', destructive: true, func: () => undefined },
    ]}
  />
)

export const OnACardHeader = () => (
  <AppCard>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
      }}
    >
      <span>
        <strong style={{ fontSize: 17 }}>Push day A</strong>
        <div style={{ fontSize: 14, opacity: 0.7 }}>Fri 28 Aug · 51 min</div>
      </span>
      <DropdownButton
        label="Workout actions"
        items={[
          { title: 'Edit this workout', href: '/workouts/1/edit' },
          { title: 'Delete this workout', destructive: true, func: () => undefined },
        ]}
      />
    </div>
  </AppCard>
)
