import { type Client, createClient } from '@connectrpc/connect'
import { auth, logger } from '@/http/interceptors'
import { FeedService } from '@/proto/api/v1/feed_service_pb'
import { AuthService } from '@/proto/api/v1/auth_service_pb'
import { UserService } from '@/proto/api/v1/user_service_pb'
import { createConnectTransport } from '@connectrpc/connect-web'
import { RoutineService } from '@/proto/api/v1/routine_service_pb'
import { WorkoutService } from '@/proto/api/v1/workout_service_pb'
import { ExerciseService } from '@/proto/api/v1/exercise_service_pb'
import { NotificationService } from '@/proto/api/v1/notification_service_pb'

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, options) => {
    // TODO: Include credentials only on refresh token and logout requests.
    return fetch(url, { ...options, credentials: 'include' })
  },
  interceptors: [logger, auth],
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
