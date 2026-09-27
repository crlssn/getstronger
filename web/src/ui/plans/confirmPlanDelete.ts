import type { TFunction } from 'i18next'

import { useConfirmationStore } from '@/stores/confirmation'

/** Asks before a plan is deleted, with the same warning wherever it is offered. */
export const confirmPlanDelete = (t: TFunction) =>
  useConfirmationStore.getState().confirm({
    body: t('training.planView.deleteConfirmBody'),
    confirmLabel: t('training.planView.delete'),
    destructive: true,
    title: t('training.planView.deleteConfirmTitle'),
  })
