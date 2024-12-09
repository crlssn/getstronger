import { create } from "@bufbuild/protobuf"
import { ConnectError } from "@connectrpc/connect"
import  { Error, ErrorDetailSchema } from "@/proto/api/v1/errors_pb"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { DeleteRoutineRequestSchema, type DeleteRoutineResponse } from "@/proto/api/v1/routines_pb"
import { type CreateExerciseRequest, CreateExerciseRequestSchema, type CreateExerciseResponse, DeleteExerciseRequestSchema, type DeleteExerciseResponse, GetExerciseRequestSchema, type GetExerciseResponse, ListSetsRequestSchema, type ListSetsResponse } from "@/proto/api/v1/exercise_pb"
import { LoginRequestSchema, type LoginResponse, type ResetPasswordRequest, ResetPasswordRequestSchema, type ResetPasswordResponse, type SignupRequest, SignupRequestSchema, type SignupResponse, type UpdatePasswordRequest, UpdatePasswordRequestSchema, type UpdatePasswordResponse, VerifyEmailRequestSchema, type VerifyEmailResponse } from "@/proto/api/v1/auth_pb"

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

export const signup = async (request: SignupRequest): Promise<SignupResponse | void> => {
  const req = create(SignupRequestSchema, request)
  return tryCatch(() => AuthClient.signup(req))
}

export const verifyEmail = async (token: string): Promise<VerifyEmailResponse | void> => {
  const req = create(VerifyEmailRequestSchema, {
    token: token,
  })

  return tryCatch(() => AuthClient.verifyEmail(req))
}

export const resetPassword = async (request: ResetPasswordRequest): Promise<ResetPasswordResponse | void> => {
  const req = create(ResetPasswordRequestSchema, request)
  return tryCatch(() => AuthClient.resetPassword(req))
}

export const updatePassword = async (request: UpdatePasswordRequest): Promise<UpdatePasswordResponse | void> => {
  const req = create(UpdatePasswordRequestSchema, request)
  return tryCatch(() => AuthClient.updatePassword(req))
}

export const getExercise = async (id: string): Promise<GetExerciseResponse | void> => {
  const req = create(GetExerciseRequestSchema, {
    id: id,
  })
  return tryCatch(() => ExerciseClient.get(req))
}

export const createExercise = async (request: CreateExerciseRequest): Promise<CreateExerciseResponse | void> => {
  const req = create(CreateExerciseRequestSchema, request)
  return tryCatch(() => ExerciseClient.create(req))
}

export const listSets = async (exerciseId: string, pageToken: Uint8Array): Promise<ListSetsResponse | void> => {
  const req = create(ListSetsRequestSchema, {
    exerciseId: exerciseId,
    pagination: {
      pageLimit: 100,
      pageToken: pageToken,
    }
  })
  return tryCatch(() => ExerciseClient.listSets(req))
}

const tryCatch = async <T>(fn: () => Promise<T>): Promise<T|void> => {
  try {
      return await fn()
  } catch (error) {
    // TODO: Use custom alert component.
    alert(error)
    if (error instanceof ConnectError) {
      for (const detail of error.findDetails(ErrorDetailSchema)) {
        switch (detail.error) {
          case Error.EMAIL_NOT_VERIFIED:
            console.warn("email is not verified");
            break;
          default:
            console.warn("unknown error:", detail.error);
        }
      }
    }
  }
}
