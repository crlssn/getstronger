import { useAuthStore } from '@/stores/auth'
import {refreshToken} from "@/http/requests.ts";

export async function refreshAccessTokenOrLogout(): Promise<void> {
  console.debug('refreshing access token or logging out')
  const res = await refreshToken()
  if (!res) return

  const authStore = useAuthStore()
  authStore.setAccessToken(res.accessToken)
}

export function scheduleTokenRefresh(): number {
  console.debug('scheduling access token refresh every 10 minutes')
  const interval = 10 * 60 * 1000 // 10 minutes
  return window.setInterval(refreshAccessTokenOrLogout, interval)
}
