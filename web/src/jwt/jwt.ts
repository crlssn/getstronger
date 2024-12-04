import type { NavigationFailure } from 'vue-router'

import router from '@/router/router'
import { create } from '@bufbuild/protobuf'
import { useAuthStore } from '@/stores/auth'
import { AuthClient } from '@/http/clients'
import { Code, ConnectError } from '@connectrpc/connect'
import { RefreshTokenRequestSchema } from '@/proto/api/v1/auth_pb'

export async function RefreshAccessTokenOrLogout(): Promise<NavigationFailure | undefined | void> {
  console.log('refresh access token or logout')
  try {
    const authStore = useAuthStore()
    const response = await AuthClient.refreshToken(create(RefreshTokenRequestSchema, {}))
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
  console.log('scheduling access token refresh every 10 minutes', new Date())
  return window.setInterval(async () => {
    try {
      console.log('refreshing access token', new Date())
      await RefreshAccessTokenOrLogout()
    } catch (error) {
      console.error('failed to refresh token:', error)
    }
  }, interval)
}
