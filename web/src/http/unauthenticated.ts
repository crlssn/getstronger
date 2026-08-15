import router from '@/router/router'
import { useAuthStore } from '@/stores/auth'

let redirectingToLogin: Promise<void> | undefined

export const logoutUnauthenticatedUser = async (): Promise<void> => {
  const authStore = useAuthStore()
  authStore.logout()

  if (router.currentRoute.value.name === 'login') return
  if (redirectingToLogin) return redirectingToLogin

  redirectingToLogin = router
    .replace({ name: 'login' })
    .then(() => undefined)
    .finally(() => {
      redirectingToLogin = undefined
    })

  return redirectingToLogin
}
