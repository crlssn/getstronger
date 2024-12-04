import { create } from "@bufbuild/protobuf"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { DeleteExerciseRequestSchema, type DeleteExerciseResponse } from "@/proto/api/v1/exercise_pb"

import { ExerciseClient, WorkoutClient } from "./clients"

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
