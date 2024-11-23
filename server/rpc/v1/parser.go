package v1

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	orm2 "github.com/crlssn/getstronger/server/pkg/orm"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/repo"
)

func parseExercisesToPB(exercises orm2.ExerciseSlice) []*apiv1.Exercise {
	pbExercises := make([]*apiv1.Exercise, 0, len(exercises))
	for _, exercise := range exercises {
		pbExercises = append(pbExercises, parseExerciseToPB(exercise))
	}

	return pbExercises
}

func parseExerciseToPB(exercise *orm2.Exercise) *apiv1.Exercise {
	return &apiv1.Exercise{
		Id:    exercise.ID,
		Name:  exercise.Title,
		Label: exercise.SubTitle.String,
	}
}

func parseRoutinesToPB(routines orm2.RoutineSlice) []*apiv1.Routine {
	pbRoutines := make([]*apiv1.Routine, 0, len(routines))
	for _, routine := range routines {
		pbRoutines = append(pbRoutines, parseRoutineToPB(routine))
	}

	return pbRoutines
}

func parseRoutineToPB(routine *orm2.Routine) *apiv1.Routine {
	var exercises []*apiv1.Exercise
	if routine.R != nil && routine.R.Exercises != nil {
		exercises = parseExercisesToPB(routine.R.Exercises)
	}

	return &apiv1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: exercises,
	}
}

func parseWorkoutSliceToPB(workoutSlice orm2.WorkoutSlice) []*apiv1.Workout {
	workouts := make([]*apiv1.Workout, 0, len(workoutSlice))
	for _, workout := range workoutSlice {
		workouts = append(workouts, parseWorkoutToPB(workout))
	}

	return workouts
}

func parseWorkoutToPB(workout *orm2.Workout) *apiv1.Workout {
	var exerciseOrder []string
	mapExerciseSets := make(map[string][]*apiv1.Set)

	if workout.R != nil {
		for _, set := range workout.R.Sets {
			if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], &apiv1.Set{
				Weight: float64(set.Weight),
				Reps:   int32(set.Reps),
			})
		}
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(exerciseOrder))
	for _, exerciseID := range exerciseOrder {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			ExerciseId: exerciseID,
			Sets:       mapExerciseSets[exerciseID],
		})
	}

	return &apiv1.Workout{
		Id:           workout.ID,
		Name:         workout.Name,
		FinishedAt:   timestamppb.New(workout.FinishedAt),
		ExerciseSets: exerciseSets,
	}
}

func parseExerciseSetsFromPB(exerciseSetSlice []*apiv1.ExerciseSets) []repo.ExerciseSet {
	exerciseSets := make([]repo.ExerciseSet, 0, len(exerciseSetSlice))
	for _, exerciseSet := range exerciseSetSlice {
		sets := make([]repo.Set, 0, len(exerciseSet.GetSets()))
		for _, set := range exerciseSet.GetSets() {
			sets = append(sets, repo.Set{
				Reps:   int(set.GetReps()),
				Weight: float32(set.GetWeight()),
			})
		}

		exerciseSets = append(exerciseSets, repo.ExerciseSet{
			ExerciseID: exerciseSet.GetExerciseId(),
			Sets:       sets,
		})
	}

	return exerciseSets
}
