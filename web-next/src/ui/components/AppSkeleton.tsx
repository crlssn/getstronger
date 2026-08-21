import { useTranslation } from 'react-i18next'

import { cn } from '@/ui/cn'

interface Props {
  lines?: number
}

// The shared pulsating placeholder for anything that fetches from the API.
// Screens drop it in behind their loading flag; the .loading-card class also
// doubles as the settle sentinel for the screenshot harness.
export const AppSkeleton = ({ lines = 3 }: Props) => {
  const { t } = useTranslation()

  return (
    <div className="loading-card" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={cn('loading-line', index === lines - 1 && 'w-full')}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
