import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { previewAnnouncement } from '@/native/audioPreview'
import {
  announcementVolumes,
  useAnnouncementsStore,
  volumeLabelKey,
  type AnnouncementVolume,
} from '@/stores/announcements'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import styles from './AnnouncementSettings.module.css'

/** Voice announcements: how loudly a recording calls each interval. */
export const AnnouncementSettings = () => {
  const { t } = useTranslation()

  const chosen = useAnnouncementsStore((state) => state.volume)
  const setVolume = useAnnouncementsStore((state) => state.setVolume)

  // Chosen and heard in one tap: the level only ever means something out on a
  // run, so the row answers in the voice it is choosing between.
  const choose = (volume: AnnouncementVolume) => {
    setVolume(volume)
    previewAnnouncement(t('settings.announcementsExample'), volume)
  }

  const tick = (selected: boolean) => (
    <span className={styles.tick}>{selected && <CheckIcon aria-hidden="true" />}</span>
  )

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.announcementsIntro')}</p>

      <section className={styles.options} aria-label={t('settings.announcements')}>
        {announcementVolumes.map((volume) => (
          <AppOptionRow
            key={volume}
            selected={chosen === volume}
            trailing={tick(chosen === volume)}
            onClick={() => choose(volume)}
          >
            <strong>{t(volumeLabelKey[volume])}</strong>
            {/* Off is the announcements alone: the cue before an interval ends
                is its own setting, and a row that said only "Off" would read
                as a silent run. */}
            {volume === 'off' && <small>{t('settings.announcementsOffBody')}</small>}
          </AppOptionRow>
        ))}
      </section>
    </div>
  )
}
