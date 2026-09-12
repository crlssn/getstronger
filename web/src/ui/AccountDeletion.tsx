import { useTranslation } from 'react-i18next'

import { brandName } from '@/brand'
import { useAuthStore } from '@/stores/auth'
import { AppButton } from '@/ui/components/AppButton'
import styles from './PolicyPage.module.css'
import { privacyEmail } from './policyContact'

/**
 * How to have the account and its data deleted, on a public route.
 *
 * Google's Data safety form and App Store Connect both want a URL that opens
 * without an account and without the app installed — the reader has usually
 * uninstalled it already — and that answers the whole question: how to ask,
 * what goes, and what is left behind. The in-app control under Me → Account
 * satisfies neither store on its own.
 */
export const AccountDeletion = () => {
  const { t } = useTranslation()

  const authenticated = useAuthStore((state) => Boolean(state.accessToken))

  return (
    <article className={styles.page}>
      {/* Signed in, the nav bar above already titles the page; a second
          heading right under it read as a stutter. Guests have no bar. */}
      <header>
        {!authenticated && <h1>{t('deletion.heading')}</h1>}
        <p>{t('deletion.updated')}</p>
      </header>

      <section className={styles.section}>
        <p>{t('deletion.intro', { brand: brandName })}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('deletion.appTitle')}</h2>
        <p>{t('deletion.appBody')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('deletion.emailTitle')}</h2>
        <p>{t('deletion.emailBody', { email: privacyEmail })}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('deletion.deletedTitle')}</h2>
        <ul>
          <li>{t('deletion.deletedAccount')}</li>
          <li>{t('deletion.deletedTraining')}</li>
          <li>{t('deletion.deletedSocial')}</li>
        </ul>
        <p>{t('deletion.deletedBody')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('deletion.keptTitle')}</h2>
        <ul>
          <li>{t('deletion.keptBackups')}</li>
          <li>{t('deletion.keptAnalytics')}</li>
          <li>{t('deletion.keptDevice')}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <p>{t('deletion.policyBody')}</p>
        <AppButton type="link" to="/privacy" colour="secondary" size="sm" width="auto">
          {t('deletion.policyLink')}
        </AppButton>
      </section>
    </article>
  )
}
