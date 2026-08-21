import type { Interceptor } from '@connectrpc/connect'

import { Code, ConnectError } from '@connectrpc/connect'
import { AuthService } from '@/proto/api/v1/auth_service_pb'
import { refreshAccessTokenOrLogout } from '@/jwt/jwt'
import { selectAuthorised, useAuthStore } from '@/stores/auth'

export const logger: Interceptor = (next) => async (req) => {
  console.debug(`sending message to ${req.url}`)
  return next(req)
}

export const auth: Interceptor = (next) => async (req) => {
  const authStore = useAuthStore.getState()
  req.header.set('Authorization', `Bearer ${authStore.accessToken}`)
  return next(req)
}

// Access tokens expire after 15 minutes and nothing renews them in the
// background, so the first request after expiry used to end the session even
// though the refresh token is good for 30 days. Refresh once and replay the
// call instead. This interceptor must sit before `auth` so the replay picks up
// the new token.
export const retryUnauthenticated: Interceptor = (next) => async (req) => {
  // Streaming responses carry Unauthenticated in the response body, which is
  // read long after this returns, so those calls recover at the call site.
  if (req.stream || req.method === AuthService.method.refreshToken) return next(req)
  if (!selectAuthorised(useAuthStore.getState())) return next(req)

  try {
    return await next(req)
  } catch (error) {
    if (!(error instanceof ConnectError) || error.code !== Code.Unauthenticated) throw error

    await refreshAccessTokenOrLogout()
    // A failed refresh has already logged the user out and redirected them.
    if (!selectAuthorised(useAuthStore.getState())) throw error

    return next(req)
  }
}
