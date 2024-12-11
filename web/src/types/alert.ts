export interface Alert {
  message: string
  seen: boolean
  type: 'error' | 'success'
}
