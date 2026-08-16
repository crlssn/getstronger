import { useAuthStore } from '@/stores/auth'
import { refreshToken } from '@/http/requests.ts'

let pendingRefresh: Promise<void> | undefined

export async function refreshAccessTokenOrLogout(): Promise<void> {
  // An expired access token fails every in-flight request at once. Share a
  // single refresh between them so they do not stampede the endpoint, which
  // reads the refresh token from the database on every call.
  pendingRefresh ??= refreshAccessToken().finally(() => {
    pendingRefresh = undefined
  })

  return pendingRefresh
}

async function refreshAccessToken(): Promise<void> {
  console.debug('refreshing access token or logging out')
  const res = await refreshToken()
  if (!res) return

  const authStore = useAuthStore()
  authStore.setAccessToken(res.accessToken)
}
