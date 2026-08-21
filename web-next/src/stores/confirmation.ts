import { create } from 'zustand'

export type Confirmation = {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmationState {
  confirmation: Confirmation | null
  resolver: ((confirmed: boolean) => void) | null
  confirm: (options: Confirmation) => Promise<boolean>
  accept: () => void
  dismiss: () => void
}

// Promise-based replacement for window.confirm, rendered by AppConfirmDialog.
export const useConfirmationStore = create<ConfirmationState>()((set, get) => {
  const settle = (confirmed: boolean) => {
    const { resolver } = get()
    set({ confirmation: null, resolver: null })
    resolver?.(confirmed)
  }

  return {
    confirmation: null,
    resolver: null,

    confirm: (options) => {
      get().resolver?.(false)
      return new Promise<boolean>((resolve) => {
        set({ confirmation: options, resolver: resolve })
      })
    },

    accept: () => settle(true),
    dismiss: () => settle(false),
  }
})
