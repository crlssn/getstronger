import { refreshToken } from '@/http/requests'
import { useAuthStore } from '@/stores/auth'
import { singleFlight } from '@/utils/singleFlight'

const refreshAccessToken = async (): Promise<void> => {
  console.debug('refreshing access token or logging out')
  const res = await refreshToken()
  if (!res) return

  useAuthStore.getState().setAccessToken(res.accessToken)
}

/**
 * Renews the access token, or logs the user out if the refresh token has gone
 * too.
 *
 * An expired access token fails every in-flight request at once, so the
 * refresh is shared between them rather than stampeding an endpoint that reads
 * the refresh token from the database on every call.
 */
export const refreshAccessTokenOrLogout = singleFlight(refreshAccessToken)
