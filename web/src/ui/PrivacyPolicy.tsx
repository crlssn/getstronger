import { useTranslation } from 'react-i18next'

import { brandName } from '@/brand'
import { useAuthStore } from '@/stores/auth'
import { AppButton } from '@/ui/components/AppButton'
import styles from './PolicyPage.module.css'
import { privacyEmail } from './policyContact'

/**
 * The privacy policy, on a public route.
 *
 * Both app stores want a policy URL that opens without an account, and Apple's
 * nutrition labels and Google's Data safety form are filled in from what this
 * page says — so it has to keep pace with what the app actually collects.
 */

export const PrivacyPolicy = () => {
  const { t } = useTranslation()

  const authenticated = useAuthStore((state) => Boolean(state.accessToken))

  return (
    <article className={styles.page}>
      {/* Signed in, the nav bar above already titles the page; a second
          heading right under it read as a stutter. Guests have no bar. */}
      <header>
        {!authenticated && <h1>{t('privacy.heading')}</h1>}
        <p>{t('privacy.updated')}</p>
      </header>

      <section className={styles.section}>
        <p>{t('privacy.intro', { brand: brandName })}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.collectTitle')}</h2>
        <ul>
          <li>{t('privacy.collectAccount')}</li>
          <li>{t('privacy.collectTraining')}</li>
          <li>{t('privacy.collectUsage')}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.useTitle')}</h2>
        <p>{t('privacy.useBody')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.shareTitle')}</h2>
        <ul>
          <li>{t('privacy.shareFollowers')}</li>
          <li>{t('privacy.shareProcessors')}</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.retentionTitle')}</h2>
        <p>{t('privacy.retentionBody')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.rightsTitle')}</h2>
        <ul>
          <li>{t('privacy.rightsEdit')}</li>
          <li>{t('privacy.rightsDelete')}</li>
          <li>{t('privacy.rightsContact', { email: privacyEmail })}</li>
        </ul>
        <AppButton type="link" to="/delete-account" colour="secondary" size="sm" width="auto">
          {t('privacy.rightsDeleteLink')}
        </AppButton>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.storageTitle')}</h2>
        <p>{t('privacy.storageBody')}</p>
      </section>

      <section className={styles.section}>
        <h2>{t('privacy.changesTitle')}</h2>
        <p>{t('privacy.changesBody')}</p>
      </section>
    </article>
  )
}
