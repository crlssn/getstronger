import type { StartingShape } from '@/utils/routineGroups'

import { useTranslation } from 'react-i18next'

import { AppSheet, SheetAction } from '@/ui/components/AppSheet'

interface Props {
  onPick: (shape: StartingShape) => void
  onClose: () => void
}

/**
 * What a new routine starts as.
 *
 * A shape rather than a mode: each choice lays out blocks and is forgotten, so
 * nothing here decides what the routine may become. Closing it without choosing
 * leaves the blank one the form already holds.
 */
export const RoutineStartSheet = ({ onPick, onClose }: Props) => {
  const { t } = useTranslation()

  return (
    <AppSheet
      title={t('routine.form.blocks.startTitle')}
      body={t('routine.form.blocks.startBody')}
      closeLabel={t('common.close')}
      onClose={onClose}
      actions={
        <>
          <SheetAction tone="primary" onClick={() => onPick('blank')}>
            {t('routine.form.blocks.startBlank')}
          </SheetAction>
          <SheetAction tone="tertiary" onClick={() => onPick('circuit')}>
            {t('routine.form.blocks.startCircuit')}
          </SheetAction>
          <SheetAction tone="tertiary" onClick={() => onPick('intervals')}>
            {t('routine.form.blocks.startIntervals')}
          </SheetAction>
        </>
      }
    />
  )
}
