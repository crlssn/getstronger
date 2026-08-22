export type ToastType = 'error' | 'info' | 'success' | 'warning'

export interface Toast {
  id: number
  message: string
  type: ToastType
}
