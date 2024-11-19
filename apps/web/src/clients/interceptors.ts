import type { Interceptor } from '@connectrpc/connect'
import { useAuthStore } from '@/stores/auth'
import { Code, ConnectError } from '@connectrpc/connect'
import { RefreshAccessTokenOrLogout } from '@/jwt/jwt'

export const logger: Interceptor = (next) => async (req) => {
  console.log(`sending message to ${req.url}`)
  return next(req)
}

export const auth: Interceptor = (next) => async (req) => {
  const authStore = useAuthStore()
  try {
    req.header.set('Authorization', `Bearer ${authStore.accessToken}`)
    return next(req)
  } catch (error) {
    if (!(error instanceof ConnectError)) {
      throw error
    }

    if (error.code !== Code.Unauthenticated) {
      throw error
    }

    console.log('refreshing access token to attempt request again')
    await RefreshAccessTokenOrLogout()
    req.header.set('Authorization', `Bearer ${authStore.accessToken}`)
    return next(req)
  }
}
