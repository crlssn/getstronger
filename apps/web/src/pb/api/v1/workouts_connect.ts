// @generated by protoc-gen-connect-es v1.6.1 with parameter "target=ts"
// @generated from file api/v1/workouts.proto (package api.v1, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import { FinishWorkoutRequest, FinishWorkoutResponse, ListWorkoutsRequest, ListWorkoutsResponse } from "./workouts_pb.js";
import { MethodKind } from "@bufbuild/protobuf";

/**
 * @generated from service api.v1.WorkoutService
 */
export const WorkoutService = {
  typeName: "api.v1.WorkoutService",
  methods: {
    /**
     *  rpc Start(StartWorkoutRequest) returns (StartWorkoutResponse) {
     *    option (auth) = true;
     *  }
     *
     * @generated from rpc api.v1.WorkoutService.Finish
     */
    finish: {
      name: "Finish",
      I: FinishWorkoutRequest,
      O: FinishWorkoutResponse,
      kind: MethodKind.Unary,
    },
    /**
     *  rpc Delete(DeleteWorkoutRequest) returns (DeleteWorkoutResponse) {
     *    option (auth) = true;
     *  }
     *
     * @generated from rpc api.v1.WorkoutService.List
     */
    list: {
      name: "List",
      I: ListWorkoutsRequest,
      O: ListWorkoutsResponse,
      kind: MethodKind.Unary,
    },
  }
} as const;
