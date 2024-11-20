import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient } from '@connectrpc/connect'
import { AuthService } from '@/pb/api/v1/auth_connect'
import { ExerciseService } from '@/pb/api/v1/exercise_connect'
import { auth, logger } from '@/clients/interceptors'
import { RoutineService } from '@/pb/api/v1/routines_connect'
import { WorkoutService } from '@/pb/api/v1/workouts_connect'

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, options) => {
    // TODO: Include credentials only on refresh token and logout requests.
    return fetch(url, { ...options, credentials: 'include' }) // Add credentials
  },
  interceptors: [logger, auth],
})

export const AuthClient = createClient(AuthService, transport)
export const ExerciseClient = createClient(ExerciseService, transport)
export const RoutineClient = createClient(RoutineService, transport)
export const WorkoutClient = createClient(WorkoutService, transport)
