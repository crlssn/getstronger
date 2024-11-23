import { AuthClient } from '@/clients/clients'
import { RefreshTokenRequest } from '@/pb/api/v1/auth_pb'
import { useAuthStore } from '@/stores/auth'
import { Code, ConnectError } from '@connectrpc/connect'
import router from '@/router/router'
import type { NavigationFailure } from 'vue-router'

export async function RefreshAccessTokenOrLogout(): Promise<void | NavigationFailure | undefined> {
  console.log('refresh access token or logout')
  try {
    const authStore = useAuthStore()
    const response = await AuthClient.refreshToken(new RefreshTokenRequest())
    authStore.setAccessToken(response.accessToken)
    console.log('refreshed access token')
  } catch (error) {
    if (error instanceof ConnectError) {
      if (error.code === Code.Unauthenticated) {
        console.warn('user unauthenticated: logging out')
        return router.push('/logout')
      }
    }
    console.log('failed to refresh access token:', error)
    throw error
  }
}

export function ScheduleTokenRefresh(): number {
  const interval = 10 * 60 * 1000 // 10 minutes
  // const interval = 60 * 1000; // 1 minute
  console.log('scheduling access token refresh every 10 minutes')
  return window.setInterval(async () => {
    try {
      console.log('refreshing access token')
      await RefreshAccessTokenOrLogout()
    } catch (error) {
      console.error('failed to refresh token:', error)
    }
  }, interval)
}
