import { useTranslation } from 'react-i18next'

// The shared pulsating placeholder for anything that fetches from the API.
// Screens drop it in behind their loading flag; the .loading-card class also
// doubles as the settle sentinel for the screenshot harness.
export default function AppSkeleton({ lines = 3 }: { lines?: number }) {
  const { t } = useTranslation()

  return (
    <div className="loading-card" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: lines }, (_, index) => (
        // Lines are indistinguishable placeholders, so the index is a stable key.
        <div
          key={index}
          className={`loading-line ${index === lines - 1 ? 'w-full' : ''}`}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
