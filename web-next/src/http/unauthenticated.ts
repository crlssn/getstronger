import { currentPath, goTo } from '@/router/navigation'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'

export const loginPath = '/login'

let redirectingToLogin: Promise<void> | undefined

export const logoutUnauthenticatedUser = async (): Promise<void> => {
  useAuthStore.getState().logout()
  usePreferencesStore.getState().reset()

  if (currentPath() === loginPath) return
  // An expired session fails every in-flight request at once; without this they
  // would each queue their own redirect.
  if (redirectingToLogin) return redirectingToLogin

  redirectingToLogin = goTo(loginPath, { replace: true }).finally(() => {
    redirectingToLogin = undefined
  })

  return redirectingToLogin
}
