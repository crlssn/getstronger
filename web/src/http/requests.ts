import { create } from "@bufbuild/protobuf"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { DeleteRoutineRequestSchema, type DeleteRoutineResponse } from "@/proto/api/v1/routines_pb"
import { DeleteExerciseRequestSchema, type DeleteExerciseResponse } from "@/proto/api/v1/exercise_pb"

import { ExerciseClient, RoutineClient, WorkoutClient } from "./clients"

export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse> => {
    const req = create(DeleteWorkoutRequestSchema, {
      id: id,  
    })

    return WorkoutClient.delete(req)
}

export const deleteExercise = async (id: string): Promise<DeleteExerciseResponse> => {
    const req = create(DeleteExerciseRequestSchema, {
      id: id,  
    })

    return ExerciseClient.delete(req)
}

export const deleteRoutine = async (id: string): Promise<DeleteRoutineResponse> => {
    const req = create(DeleteRoutineRequestSchema, {
      id: id,  
    })

    return RoutineClient.delete(req)
}
