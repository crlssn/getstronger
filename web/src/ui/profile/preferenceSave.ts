import { useState } from 'react'

import { useToastStore } from '@/stores/toasts'

interface Messages {
  /** The toast a saved preference raises. */
  updated: string
  /** The line the row shows when the server refused it. */
  failed: string
}

/**
 * Applies a preference straight away, then tells the server.
 *
 * A settings row has no save button, so the change has to look done before the
 * request answers. A failure puts the control back and hands the row a line
 * saying why — without one the control appears to snap back on its own.
 */
export const usePreferenceSave = () => {
  const [saving, setSaving] = useState<string>()
  const [failure, setFailure] = useState<{ field: string; message: string }>()

  const save = async <T>(
    field: string,
    previous: T,
    next: T,
    apply: (value: T) => void,
    request: () => Promise<unknown>,
    messages: Messages,
  ) => {
    if (previous === next) return

    apply(next)
    setSaving(field)
    setFailure(undefined)
    const response = await request()
    setSaving(undefined)

    if (!response) {
      apply(previous)
      setFailure({ field, message: messages.failed })
      return
    }

    useToastStore.getState().success(messages.updated)
  }

  return {
    save,
    /** Whether this field's request is still out. */
    saving: (field: string) => saving === field,
    /** Why this field's last change did not save, if it did not. */
    failureOn: (field: string) => (failure?.field === field ? failure.message : undefined),
  }
}
