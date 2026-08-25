import { useTranslation } from 'react-i18next'

import { useConfirmationStore } from '@/stores/confirmation'
import { AppSheet, SheetAction } from '@/ui/components/AppSheet'

/**
 * The app-styled replacement for `window.confirm`.
 *
 * One instance renders whatever `useConfirmationStore.confirm()` was last
 * asked for, so any code can ask a question without owning a dialog.
 */
export const AppConfirmDialog = () => {
  const { t } = useTranslation()
  const confirmation = useConfirmationStore((state) => state.confirmation)

  if (!confirmation) return null

  const { accept, dismiss } = useConfirmationStore.getState()

  return (
    <AppSheet
      title={confirmation.title}
      body={confirmation.body}
      onClose={dismiss}
      actions={
        <>
          <SheetAction tone={confirmation.destructive ? 'danger' : 'primary'} onClick={accept}>
            {confirmation.confirmLabel}
          </SheetAction>
          <SheetAction tone="tertiary" onClick={dismiss}>
            {confirmation.cancelLabel ?? t('common.cancel')}
          </SheetAction>
        </>
      }
    />
  )
}
