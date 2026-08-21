import { Capacitor } from '@capacitor/core'
import { nativeFetch } from '@/http/native'
import { type Client, createClient } from '@connectrpc/connect'
import { auth, logger, retryUnauthenticated } from '@/http/interceptors'
import { offlineCache } from '@/http/offlineCache'
import { FeedService } from '@/proto/api/v1/feed_service_pb'
import { AuthService } from '@/proto/api/v1/auth_service_pb'
import { UserService } from '@/proto/api/v1/user_service_pb'
import { createConnectTransport } from '@connectrpc/connect-web'
import { RoutineService } from '@/proto/api/v1/routine_service_pb'
import { WorkoutService } from '@/proto/api/v1/workout_service_pb'
import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { NotificationService } from '@/proto/api/v1/notification_service_pb'

// In the browser the refresh token travels as a cookie, so requests carry
// credentials. Native builds route through CapacitorHttp instead, where the
// platform's own cookie jar plays that role; see http/native.ts.
const browserFetch: typeof globalThis.fetch = (url, options) => {
  // TODO: Include credentials only on refresh token and logout requests.
  return fetch(url, { ...options, credentials: 'include' })
}

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: Capacitor.isNativePlatform() ? nativeFetch : browserFetch,
  // Interceptors run outermost first, so `auth` stays last: it stamps the
  // current access token onto both the original call and any replay.
  // `offlineCache` sits outermost so it can serve stale reads when every
  // deeper layer, including the token refresh, is unreachable.
  interceptors: [offlineCache, logger, retryUnauthenticated, auth],
})

export const authClient: Client<typeof AuthService> = createClient(AuthService, transport)
export const feedClient: Client<typeof FeedService> = createClient(FeedService, transport)
export const userClient: Client<typeof UserService> = createClient(UserService, transport)
export const routineClient: Client<typeof RoutineService> = createClient(RoutineService, transport)
export const workoutClient: Client<typeof WorkoutService> = createClient(WorkoutService, transport)
export const exerciseClient: Client<typeof ExerciseService> = createClient(
  ExerciseService,
  transport,
)
export const notificationClient: Client<typeof NotificationService> = createClient(
  NotificationService,
  transport,
)
