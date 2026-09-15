import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/outline'
import { AppCycleButton, AppStat } from 'getstronger-ds'

export const TheValuesItStepsThrough = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
    <AppCycleButton label="Announcements are full, tap to change" icon={SpeakerWaveIcon}>
      Full
    </AppCycleButton>
    <AppCycleButton label="Announcements are brief, tap to change" icon={SpeakerWaveIcon}>
      Brief
    </AppCycleButton>
    <AppCycleButton
      label="Announcements are off, tap to change"
      icon={SpeakerXMarkIcon}
      active={false}
    >
      Off
    </AppCycleButton>
  </div>
)

export const ChangedMidActivity = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'flex-start' }}>
    <div style={{ display: 'flex', gap: 24 }}>
      <AppStat size="xl" label="Pace now" value="5:24" unit="/km" />
      <AppStat size="xl" label="Distance" value="6.8" unit="km" />
    </div>
    <AppCycleButton label="Announcements are brief, tap to change" icon={SpeakerWaveIcon}>
      Brief
    </AppCycleButton>
  </div>
)
