import { DeleteWorkoutRequestSchema, type DeleteWorkoutResponse } from "@/proto/api/v1/workouts_pb"
import { WorkoutClient } from "./clients"
import { create } from "@bufbuild/protobuf"

export const deleteWorkout = async (id: string): Promise<DeleteWorkoutResponse> => {
    const req = create(DeleteWorkoutRequestSchema, {
      id: id,  
    })

    return WorkoutClient.delete(req)
}
