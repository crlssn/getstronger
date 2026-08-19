import { ref } from 'vue'
import { defineStore } from 'pinia'

export type Confirmation = {
  title: string
  body?: string
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
}

// Promise-based replacement for window.confirm, rendered by AppConfirmDialog.
export const useConfirmationStore = defineStore('confirmation', () => {
  const confirmation = ref<Confirmation | null>(null)
  let resolver: ((confirmed: boolean) => void) | null = null

  const confirm = (options: Confirmation): Promise<boolean> => {
    resolver?.(false)
    confirmation.value = options
    return new Promise((resolve) => {
      resolver = resolve
    })
  }

  const settle = (confirmed: boolean) => {
    confirmation.value = null
    resolver?.(confirmed)
    resolver = null
  }

  const accept = () => settle(true)
  const dismiss = () => settle(false)

  return { accept, confirm, confirmation, dismiss }
})
