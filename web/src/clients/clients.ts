import { createConnectTransport } from '@connectrpc/connect-web'
import { createClient } from '@connectrpc/connect'
import { auth, logger } from '@/clients/interceptors'
import {AuthService} from "@/proto/api/v1/auth_pb.ts";
import {RoutineService} from "@/proto/api/v1/routines_pb.ts";
import {WorkoutService} from "@/proto/api/v1/workouts_pb.ts";
import {ExerciseService} from "@/proto/api/v1/exercise_pb.ts";

const transport = createConnectTransport({
  baseUrl: import.meta.env.VITE_API_URL,
  fetch: (url, options) => {
    // TODO: Include credentials only on refresh token and logout requests.
    return fetch(url, { ...options, credentials: 'include' }) // Add credentials
  },
  interceptors: [logger, auth],
})

export const AuthClient = createClient(AuthService, transport)
export const RoutineClient = createClient(RoutineService, transport)
export const WorkoutClient = createClient(WorkoutService, transport)
export const ExerciseClient = createClient(ExerciseService, transport)
