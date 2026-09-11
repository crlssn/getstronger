import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { previewIntervalCue } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { usePreferencesStore } from '@/stores/preferences'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { cueLeads } from '@/utils/intervalCue'
import styles from './IntervalCueSettings.module.css'

/** Interval cue: how much warning a recording gives before an interval ends. */
export const IntervalCueSettings = () => {
  const { t } = useTranslation()

  const chosen = usePreferencesStore((state) => state.intervalCueLeadSeconds)
  const setLead = usePreferencesStore((state) => state.setIntervalCueLeadSeconds)
  const volume = useAnnouncementsStore((state) => state.volume)

  // A number of seconds means nothing until it has been heard once, so the row
  // says the words the recording will say.
  const choose = (seconds: number) => {
    setLead(seconds)
    previewIntervalCue(t('timedCircuit.cueSeconds', { count: seconds }), seconds, volume)
  }

  const tick = (selected: boolean) => (
    <span className={styles.tick}>{selected && <CheckIcon aria-hidden="true" />}</span>
  )

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.intervalCueIntro')}</p>

      <section className={styles.options} aria-label={t('settings.intervalCue')}>
        {cueLeads.map((seconds) => (
          <AppOptionRow
            key={seconds}
            selected={chosen === seconds}
            trailing={tick(chosen === seconds)}
            onClick={() => choose(seconds)}
          >
            <strong>
              {seconds === 0
                ? t('settings.intervalCueOff')
                : t('settings.intervalCueLead', { count: seconds })}
            </strong>
            {/* Silence is a choice too, and the row says what it means rather
                than leaving Off to be read as a broken cue. */}
            {seconds === 0 && <small>{t('settings.intervalCueOffBody')}</small>}
          </AppOptionRow>
        ))}
      </section>
    </div>
  )
}
