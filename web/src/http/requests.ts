import { create } from "@bufbuild/protobuf"
import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"

import { WorkoutClient } from "./clients"

export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse> => {
    const req = create(DeleteWorkoutRequestSchema, {
      id: id,  
    })

    return WorkoutClient.delete(req)
}
