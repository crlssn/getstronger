import { useTranslation } from 'react-i18next'
import { Link, Outlet } from 'react-router-dom'

import { brandName, brandNameParts, brandSlogan } from '@/brand'
import { AppAlert } from '@/ui/components/AppAlert'
import styles from './GuestView.module.css'

/** The shell a signed-out visitor sees: the brand, and one narrow column. */
export const GuestView = () => {
  const { t } = useTranslation()

  return (
    <div className={styles.guestShell}>
      <header className={styles.guestHeader}>
        <Link
          to="/login"
          className={styles.guestBrand}
          aria-label={t('auth.loginTitle', { brand: brandName })}
        >
          <span className={styles.guestBrandMark}>
            <img src="/favicon.png" alt="" />
          </span>
          <span className={styles.guestBrandCopy}>
            <strong>
              <span>{brandNameParts[0]}</span>
              {brandNameParts[1]}
            </strong>
            <span>{brandSlogan}</span>
          </span>
        </Link>
      </header>

      <AppAlert contentClassName={styles.guestAlert} />

      <main className={styles.guestMain}>
        <Outlet />
      </main>
    </div>
  )
}
