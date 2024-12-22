import { useAuthStore } from '@/stores/auth'
import { refreshToken } from '@/http/requests.ts'

export async function refreshAccessTokenOrLogout(): Promise<void> {
  console.debug('refreshing access token or logging out')
  const res = await refreshToken()
  if (!res) return

  const authStore = useAuthStore()
  authStore.setAccessToken(res.accessToken)
}
