import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { previewPaceTone } from '@/native/audioPreview'
import { useAnnouncementsStore } from '@/stores/announcements'
import { usePreferencesStore } from '@/stores/preferences'
import { AppButton } from '@/ui/components/AppButton'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import {
  paceReferenceChoices,
  paceToneLabelKey,
  type PaceReferenceChoice,
  type PaceTone,
} from '@/utils/pacing'
import styles from './PaceToneSettings.module.css'

/** The two notes, in the order the example offers them. */
const paceTones: PaceTone[] = ['ahead', 'behind']

/** What each note is called on the button that sounds it. */
const paceToneExampleKey: Record<PaceTone, string> = {
  ahead: 'settings.paceTonesFaster',
  behind: 'settings.paceTonesSlower',
}

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
            onClick={() => setPaceReference(choice)}
          >
            <strong>{t(paceToneLabelKey[choice])}</strong>
            <small>{t(paceToneBodyKey[choice])}</small>
          </AppOptionRow>
        ))}
      </section>

      {/* Under the choice rather than on it: picking which session to compare
          with is not a request to hear anything, and a note is the one thing
          the rows above cannot describe. Each is offered under its own name,
          because which way round the pair goes is what has to be known before
          the first one arrives mid-run. */}
      <section className={styles.example} aria-label={t('settings.paceTonesExample')} role="group">
        <h2>{t('settings.paceTonesExample')}</h2>
        <div className={styles.notes}>
          {paceTones.map((tone) => (
            <AppButton
              key={tone}
              type="button"
              colour="secondary"
              onClick={() => previewPaceTone(tone, volume)}
            >
              {t(paceToneExampleKey[tone])}
            </AppButton>
          ))}
        </div>
      </section>
    </div>
  )
}
