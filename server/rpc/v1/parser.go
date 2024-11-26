package v1

import (
	"google.golang.org/protobuf/types/known/timestamppb"

	orm "github.com/crlssn/getstronger/server/pkg/orm"
	apiv1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/repo"
)

func parseExerciseSliceToPB(exercises orm.ExerciseSlice) []*apiv1.Exercise {
	pbExercises := make([]*apiv1.Exercise, 0, len(exercises))
	for _, exercise := range exercises {
		pbExercises = append(pbExercises, parseExerciseToPB(exercise))
	}

	return pbExercises
}

func parseExerciseToPB(exercise *orm.Exercise) *apiv1.Exercise {
	return &apiv1.Exercise{
		Id:    exercise.ID,
		Name:  exercise.Title,
		Label: exercise.SubTitle.String,
	}
}

func parseRoutineSliceToPB(routines orm.RoutineSlice) []*apiv1.Routine {
	pbRoutines := make([]*apiv1.Routine, 0, len(routines))
	for _, routine := range routines {
		pbRoutines = append(pbRoutines, parseRoutineToPB(routine))
	}

	return pbRoutines
}

func parseRoutineToPB(routine *orm.Routine) *apiv1.Routine {
	var exercises []*apiv1.Exercise
	if routine.R != nil && routine.R.Exercises != nil {
		exercises = parseExerciseSliceToPB(routine.R.Exercises)
	}

	return &apiv1.Routine{
		Id:        routine.ID,
		Name:      routine.Title,
		Exercises: exercises,
	}
}

func parseWorkoutSliceToPB(workoutSlice orm.WorkoutSlice) []*apiv1.Workout {
	workouts := make([]*apiv1.Workout, 0, len(workoutSlice))
	for _, workout := range workoutSlice {
		workouts = append(workouts, parseWorkoutToPB(workout))
	}

	return workouts
}

func parseWorkoutToPB(workout *orm.Workout) *apiv1.Workout {
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

func parseSetSliceToExerciseSetsPB(setSlice orm.SetSlice) []*apiv1.ExerciseSets {
	mapExerciseSets := make(map[string][]*apiv1.Set)
	for _, set := range setSlice {
		if _, ok := mapExerciseSets[set.ExerciseID]; !ok {
			mapExerciseSets[set.ExerciseID] = make([]*apiv1.Set, 0)
		}

		mapExerciseSets[set.ExerciseID] = append(mapExerciseSets[set.ExerciseID], &apiv1.Set{
			Weight: float64(set.Weight),
			Reps:   int32(set.Reps),
		})
	}

	exerciseSets := make([]*apiv1.ExerciseSets, 0, len(mapExerciseSets))
	for exerciseID, sets := range mapExerciseSets {
		exerciseSets = append(exerciseSets, &apiv1.ExerciseSets{
			ExerciseId: exerciseID,
			Sets:       sets,
		})
	}

	return exerciseSets
}

func parsePersonalBestSliceToPB(personalBests orm.PersonalBestSlice, exercises orm.ExerciseSlice) []*apiv1.PersonalBest {
	mapExercises := make(map[string]*orm.Exercise, len(exercises))
	for _, exercise := range exercises {
		mapExercises[exercise.ID] = exercise
	}

	pbs := make([]*apiv1.PersonalBest, 0, len(personalBests))
	for _, pb := range personalBests {
		pbs = append(pbs, &apiv1.PersonalBest{
			Exercise: parseExerciseToPB(mapExercises[pb.ExerciseID.String]),
			Set: &apiv1.Set{
				Weight: float64(pb.Weight.Float32),
				Reps:   int32(pb.Reps.Int),
			},
		})
	}

	return pbs
}

func parseUserSliceToPB(users orm.UserSlice) []*apiv1.User {
	pbUsers := make([]*apiv1.User, 0, len(users))
	for _, u := range users {
		pbUsers = append(pbUsers, &apiv1.User{
			Id:        u.ID,
			FirstName: u.FirstName,
			LastName:  u.LastName,
		})
	}

	return pbUsers
}
