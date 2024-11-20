import {defineStore} from 'pinia'

import type {ExerciseID, RoutineID, RoutineWorkout, Set, Workout} from "@/types/workout";

export const useWorkoutStore = defineStore('workout', {
  state: () => ({
    routineWorkouts: {} as RoutineWorkout, // Define state with your types
  }),
  actions: {
    initialiseWorkout(routineID: RoutineID) {
      this.routineWorkouts[routineID] = {
        exerciseSets: {},
      };
    },
    addEmptySetIfNone(routineID: RoutineID, exerciseID: ExerciseID) {
      if (!this.workoutExists(routineID)) {
        this.initialiseWorkout(routineID);
      }

      const workout = this.getWorkout(routineID);
      if (!workout.exerciseSets) {
        workout.exerciseSets = {};
      }

      if (!workout.exerciseSets[exerciseID]) {
        workout.exerciseSets[exerciseID] = [];
      }

      const hasEmptySet = workout.exerciseSets[exerciseID].some(
        set => !set.weight || !set.reps
      );

      if (!hasEmptySet) {
        workout.exerciseSets[exerciseID].push({});
      }
    },
  },
  getters: {
    workoutExists: (state) => (routineID: RoutineID): boolean => {
      return state.routineWorkouts[routineID] !== undefined;
    },
    getWorkout: (state) => (routineID: RoutineID): Workout => {
      if (state.routineWorkouts[routineID] === undefined) {
        throw new Error(`Workout for routineID ${routineID} could not be found`);
      }

      return state.routineWorkouts[routineID];
    },
  },
  persist: true,
});
