package v1

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/apps/backend/pkg/repo"
)

func parseExercisesToPB(exercises orm.ExerciseSlice) []*v1.Exercise {
	pbExercises := make([]*v1.Exercise, 0, len(exercises))
	for _, exercise := range exercises {
		pbExercises = append(pbExercises, parseExerciseToPB(exercise))
	}

	return pbExercises
}

func parseExerciseToPB(exercise *orm.Exercise) *v1.Exercise {
	return &v1.Exercise{
		Id:    exercise.ID,
		Name:  exercise.Title,
		Label: exercise.SubTitle.String,
	}
}

func parseRoutinesToPB(routines orm.RoutineSlice) []*v1.Routine {
	pbRoutines := make([]*v1.Routine, 0, len(routines))
	for _, routine := range routines {
		pbRoutines = append(pbRoutines, parseRoutineToPB(routine))
	}

	return pbRoutines
}

func parseRoutineToPB(routine *orm.Routine) *v1.Routine {
	var exercises []*v1.Exercise
	if routine.R != nil && routine.R.Exercises != nil {
		exercises = parseExercisesToPB(routine.R.Exercises)
	}

	return &v1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: exercises,
	}
}

func parseWorkoutSliceToPB(workoutSlice orm.WorkoutSlice) []*v1.Workout {
	workouts := make([]*v1.Workout, 0, len(workoutSlice))
	for _, workout := range workoutSlice {
		workouts = append(workouts, parseWorkoutToPB(workout))
	}

	return workouts
}

func parseWorkoutToPB(workout *orm.Workout) *v1.Workout {
	var exerciseOrder []string
	mapExerciseSets := make(map[string][]*v1.Set)

	if workout.R != nil {
		for _, set := range workout.R.Sets {
			if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
				exerciseOrder = append(exerciseOrder, set.ExerciseID)
			}

			mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], &v1.Set{
				Weight: float64(set.Weight),
				Reps:   int32(set.Reps),
			})
		}
	}

	exerciseSets := make([]*v1.ExerciseSets, 0, len(exerciseOrder))
	for _, exerciseID := range exerciseOrder {
		exerciseSets = append(exerciseSets, &v1.ExerciseSets{
			ExerciseId: exerciseID,
			Sets:       mapExerciseSets[exerciseID],
		})
	}

	return &v1.Workout{
		Id:           workout.ID,
		Name:         workout.Name,
		FinishedAt:   timestamppb.New(workout.FinishedAt),
		ExerciseSets: exerciseSets,
	}
}

func parseExerciseSetsFromPB(exerciseSetSlice []*v1.ExerciseSets) []repo.ExerciseSet {
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
