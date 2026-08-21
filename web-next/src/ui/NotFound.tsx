import { useTranslation } from 'react-i18next'

export const NotFound = () => {
  const { t } = useTranslation()

  return (
    <div className="p-4 text-center">
      <h1 className="mt-4 text-balance text-5xl font-semibold tracking-tight text-text-muted">
        {t('notFound.title')}
      </h1>
      <p className="mt-6 text-pretty text-lg font-medium text-text-subtle">{t('notFound.body')}</p>
    </div>
  )
}
