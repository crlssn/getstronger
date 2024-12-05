import { create } from "@bufbuild/protobuf"
import { ConnectError } from "@connectrpc/connect"
import  { Error, ErrorDetailSchema } from "@/proto/api/v1/errors_pb"
import { LoginRequestSchema, type LoginResponse } from "@/proto/api/v1/auth_pb"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { DeleteRoutineRequestSchema, type DeleteRoutineResponse } from "@/proto/api/v1/routines_pb"
import { DeleteExerciseRequestSchema, type DeleteExerciseResponse } from "@/proto/api/v1/exercise_pb"

import { AuthClient, ExerciseClient, RoutineClient, WorkoutClient } from "./clients"

/**
 * Deletes a workout by its ID.
 *
 * @param {string} id - The ID of the workout to delete.
 * @returns {Promise<DeleteWorkoutResponse | void>} A promise that resolves to the response of the delete operation or void if an error occurs.
 */
export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse | void> => {
  const req = create(DeleteWorkoutRequestSchema, {
    id: id,  
  })

  return tryCatch(() => WorkoutClient.delete(req))
}

/**
 * Deletes an exercise by its ID.
 *
 * @param {string} id - The ID of the exercise to be deleted.
 * @returns {Promise<DeleteExerciseResponse | void>} A promise that resolves to the response of the delete operation or void if an error occurs.
 */
export const deleteExercise = async (id: string): Promise<DeleteExerciseResponse | void> => {
  const req = create(DeleteExerciseRequestSchema, {
    id: id,  
  })

  return tryCatch(() => ExerciseClient.delete(req))
}

/**
 * Deletes a routine by its ID.
 *
 * @param {string} id - The ID of the routine to delete.
 * @returns {Promise<DeleteRoutineResponse | void>} A promise that resolves to the response of the delete operation or void if an error occurs.
 */
export const deleteRoutine = async (id: string): Promise<DeleteRoutineResponse | void> => {
  const req = create(DeleteRoutineRequestSchema, {
    id: id,  
  })

  return tryCatch(() => RoutineClient.delete(req))
}

/**
 * Logs the user in using the provided email and password.
 *
 * @param {string} email - The email address of the user.
 * @param {string} password - The password of the user.
 * @returns {Promise<LoginResponse | void>} A promise that resolves to the response of the login operation or void if an error occurs.
 */
export const login = async (email: string, password: string): Promise<LoginResponse | void> => {
  const req = create(LoginRequestSchema, {
      email: email,
      password: password,
  })

  return tryCatch(() => AuthClient.login(req))
}

/**
 * Executes an asynchronous function and catches any errors that occur during its execution.
 * If an error is caught, it displays an alert with the error message.
 * 
 * @template T - The type of the resolved value of the promise.
 * @param {() => Promise<T>} fn - The asynchronous function to be executed.
 * @returns {Promise<T | void>} - A promise that resolves to the value returned by the function, or void if an error occurs.
 */
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
