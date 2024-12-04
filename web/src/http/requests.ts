import { create } from "@bufbuild/protobuf"
import { LoginRequestSchema, type LoginResponse } from "@/proto/api/v1/auth_pb"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { DeleteRoutineRequestSchema, type DeleteRoutineResponse } from "@/proto/api/v1/routines_pb"
import { DeleteExerciseRequestSchema, type DeleteExerciseResponse } from "@/proto/api/v1/exercise_pb"

import { AuthClient, ExerciseClient, RoutineClient, WorkoutClient } from "./clients"

export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse | void> => {
  const req = create(DeleteWorkoutRequestSchema, {
    id: id,  
  })

  return tryCatch(() => WorkoutClient.delete(req))
}

export const deleteExercise = async (id: string): Promise<DeleteExerciseResponse | void> => {
  const req = create(DeleteExerciseRequestSchema, {
    id: id,  
  })

  return tryCatch(() => ExerciseClient.delete(req))
}

export const deleteRoutine = async (id: string): Promise<DeleteRoutineResponse | void> => {
  const req = create(DeleteRoutineRequestSchema, {
    id: id,  
  })

  return tryCatch(() => RoutineClient.delete(req))
}

export const login = async (email: string, password: string): Promise<LoginResponse | void> => {
  const req = create(LoginRequestSchema, {
      email: email,
      password: password,
  })

  return tryCatch(() => AuthClient.login(req))
}

const tryCatch = async <T>(fn: () => Promise<T>): Promise<T|void> => {
    try {
        return await fn()
    } catch (error) {
        console.error(error)
    }
}
