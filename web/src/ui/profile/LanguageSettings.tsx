import { CheckIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

import { deviceLocale, localeNames, type AppLocale } from '@/i18n'
import { useLocaleStore } from '@/stores/locale'
import { AppOptionRow } from '@/ui/components/AppOptionRow'
import styles from './LanguageSettings.module.css'

/** Language: which catalogue the app reads from, on this device. */
export const LanguageSettings = () => {
  const { t } = useTranslation()

  const chosen = useLocaleStore((state) => state.locale)
  const setLocale = useLocaleStore((state) => state.setLocale)

  const tick = (selected: boolean) => (
    <span className={styles.tick}>{selected && <CheckIcon aria-hidden="true" />}</span>
  )

  return (
    <div className={styles.stack}>
      <p className={styles.intro}>{t('settings.languageIntro')}</p>

      <section className={styles.options} aria-label={t('settings.language')}>
        {/* Following the device is a choice too, and the row says which
            language that currently is — otherwise picking it is a guess. */}
        <AppOptionRow
          selected={chosen === undefined}
          trailing={tick(chosen === undefined)}
          onClick={() => setLocale(undefined)}
        >
          <strong>{t('settings.languageDevice')}</strong>
          <small>{localeNames[deviceLocale]}</small>
        </AppOptionRow>

        {(Object.keys(localeNames) as AppLocale[]).map((locale) => (
          <AppOptionRow
            key={locale}
            selected={chosen === locale}
            trailing={tick(chosen === locale)}
            onClick={() => setLocale(locale)}
          >
            <strong>{localeNames[locale]}</strong>
          </AppOptionRow>
        ))}
      </section>
    </div>
  )
}
