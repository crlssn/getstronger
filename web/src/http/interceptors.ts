import type { Interceptor } from '@connectrpc/connect'

import { useAuthStore } from '@/stores/auth'

export const logger: Interceptor = (next) => async (req) => {
  console.debug(`sending message to ${req.url}`)
  return next(req)
}

export const auth: Interceptor = (next) => async (req) => {
  const authStore = useAuthStore()
  req.header.set('Authorization', `Bearer ${authStore.accessToken}`)
  return next(req)
}
