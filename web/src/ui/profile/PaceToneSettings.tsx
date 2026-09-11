import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { previewPaceTones } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { usePreferencesStore } from '@/stores/preferences'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import { paceReferenceChoices, paceToneLabelKey, type PaceReferenceChoice } from '@/utils/pacing'
import styles from './PaceToneSettings.module.css'

/** What each choice means, under its name. */
const paceToneBodyKey: Record<PaceReferenceChoice, string> = {
  off: 'settings.paceTonesOffBody',
  previous: 'settings.paceTonesPreviousBody',
  best: 'settings.paceTonesBestBody',
}

/** Pace tones: which of the athlete's sessions a recording is held against, or none. */
export const PaceToneSettings = () => {
  const { t } = useTranslation()

  const chosen = usePreferencesStore((state) => state.paceReference)
  const setPaceReference = usePreferencesStore((state) => state.setPaceReference)
  const volume = useAnnouncementsStore((state) => state.volume)

  // Two notes no sentence describes: picking a comparison sounds the pair.
  const choose = (choice: PaceReferenceChoice) => {
    setPaceReference(choice)
    previewPaceTones(choice, volume)
  }

  const tick = (selected: boolean) => (
    <span className={styles.tick}>{selected && <CheckIcon aria-hidden="true" />}</span>
  )

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.paceTonesIntro')}</p>

      <section className={styles.options} aria-label={t('settings.paceTones')}>
        {paceReferenceChoices.map((choice) => (
          <AppOptionRow
            key={choice}
            selected={chosen === choice}
            trailing={tick(chosen === choice)}
            onClick={() => choose(choice)}
          >
            <strong>{t(paceToneLabelKey[choice])}</strong>
            <small>{t(paceToneBodyKey[choice])}</small>
          </AppOptionRow>
        ))}
      </section>
    </div>
  )
}
