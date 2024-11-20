import {defineStore} from 'pinia'

import type {ExerciseID, RoutineID, RoutineWorkout, Set, Workout} from "@/types/workout";

export const useWorkoutStore = defineStore('workout', {
  state: () => ({
    routineWorkouts: {} as RoutineWorkout, // Define state with your types
  }),
  actions: {
    initialiseWorkout(routineID: RoutineID) {
      this.routineWorkouts[routineID] = {
        exercise_sets: {},
      };
    },
    addSet(routineID: RoutineID, exerciseID: ExerciseID, set: Set) {
      if (!this.workoutExists(routineID)) {
        this.initialiseWorkout(routineID);
      }

      const workout = this.getWorkout(routineID);
      if (!workout.exercise_sets) {
        throw new Error('Exercise sets does not exist');
      }

      if (!workout.exercise_sets[exerciseID]) {
        workout.exercise_sets[exerciseID] = [];
      }

      workout.exercise_sets[exerciseID].push(set);
    },
    addEmptySetIfNone(routineID: RoutineID, exerciseID: ExerciseID) {
      if (!this.workoutExists(routineID)) {
        this.initialiseWorkout(routineID);
      }

      const workout = this.getWorkout(routineID);
      if (!workout.exercise_sets) {
        workout.exercise_sets = {};
      }

      if (!workout.exercise_sets[exerciseID]) {
        workout.exercise_sets[exerciseID] = [];
      }

      const hasEmptySet = workout.exercise_sets[exerciseID].some(
        set => !set.weight || !set.reps
      );

      if (!hasEmptySet) {
        workout.exercise_sets[exerciseID].push({});
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
