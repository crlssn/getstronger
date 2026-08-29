import { useTranslation } from 'react-i18next'

import { AppSegmentedNav } from '@/ui/components/AppSegmented'

export const TrainingTabs = () => {
  const { t } = useTranslation()

  return (
    <AppSegmentedNav
      label={t('training.heading')}
      links={[
        { label: t('common.routines'), to: '/routines' },
        { label: t('common.plans'), to: '/plans' },
      ]}
    />
  )
}
