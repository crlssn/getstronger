import { HandThumbUpIcon } from '@heroicons/react/24/outline'
import { AppCard, AppReactionButton } from 'getstronger-ds'

export const OnAndOff = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <AppReactionButton
      label="Rep this workout, 12 reps"
      icon={HandThumbUpIcon}
      count={12}
      pressed={false}
    />
    <AppReactionButton
      label="Take back your rep, 13 reps"
      icon={HandThumbUpIcon}
      count={13}
      pressed
    />
  </div>
)

export const UnderAWorkout = () => (
  <AppCard>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <div>
        <p style={{ margin: 0, fontWeight: 600 }}>Push day A</p>
        <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Fri 28 Aug · 51 min · 7,240 kg</p>
      </div>
      <AppReactionButton
        label="Rep this workout, 12 reps"
        icon={HandThumbUpIcon}
        count={12}
        pressed={false}
      />
    </div>
  </AppCard>
)
