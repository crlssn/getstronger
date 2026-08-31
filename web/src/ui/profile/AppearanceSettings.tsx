import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { useLocaleStore } from '@/stores/locale'
import { themeLabelKey, type AppTheme } from '@/theme'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import styles from './AppearanceSettings.module.css'

const themes: AppTheme[] = ['light', 'dark']

/** Appearance: which palette the app is drawn in, on this device. */
export const AppearanceSettings = () => {
  const { t } = useTranslation()

  const chosen = useLocaleStore((state) => state.theme)
  const device = useLocaleStore((state) => state.deviceTheme)
  const setTheme = useLocaleStore((state) => state.setTheme)

  const tick = (selected: boolean) => (
    <span className={styles.tick}>{selected && <CheckIcon aria-hidden="true" />}</span>
  )

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.appearanceIntro')}</p>

      <section className={styles.options} aria-label={t('settings.appearance')}>
        {/* Following the device is a choice too, and the row says which
            palette that currently is — otherwise picking it is a guess. */}
        <AppOptionRow
          selected={chosen === undefined}
          trailing={tick(chosen === undefined)}
          onClick={() => setTheme(undefined)}
        >
          <strong>{t('settings.appearanceSystem')}</strong>
          <small>{t(themeLabelKey[device])}</small>
        </AppOptionRow>

        {themes.map((theme) => (
          <AppOptionRow
            key={theme}
            selected={chosen === theme}
            trailing={tick(chosen === theme)}
            onClick={() => setTheme(theme)}
          >
            <strong>{t(themeLabelKey[theme])}</strong>
          </AppOptionRow>
        ))}
      </section>
    </div>
  )
}
