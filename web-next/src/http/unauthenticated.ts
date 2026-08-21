import { currentPath, goTo } from '@/router/navigation'
import { useAuthStore } from '@/stores/auth'
import { usePreferencesStore } from '@/stores/preferences'
import { singleFlight } from '@/utils/singleFlight'

export const loginPath = '/login'

// An expired session fails every in-flight request at once; without this each
// failure would queue its own redirect.
const redirectToLogin = singleFlight(() => goTo(loginPath, { replace: true }))

export const logoutUnauthenticatedUser = async (): Promise<void> => {
  useAuthStore.getState().logout()
  usePreferencesStore.getState().reset()

  if (currentPath() === loginPath) return
  await redirectToLogin()
}
