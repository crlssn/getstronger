package v1

import (
	"github.com/crlssn/getstronger/apps/backend/pkg/orm"
	v1 "github.com/crlssn/getstronger/apps/backend/pkg/pb/api/v1"
)

func parseExercisesToPB(exercises orm.ExerciseSlice) []*v1.Exercise {
	pbExercises := make([]*v1.Exercise, 0, len(exercises))
	for _, exercise := range exercises {
		pbExercises = append(pbExercises, parseExerciseToPB(exercise))
	}

	return pbExercises
}

func parseExerciseToPB(exercise *orm.Exercise) *v1.Exercise {
	var restBetweenSets *v1.RestBetweenSets
	if exercise.RestBetweenSets.Valid {
		restBetweenSets = &v1.RestBetweenSets{
			Seconds: int32(exercise.RestBetweenSets.Int16),
		}
	}

	return &v1.Exercise{
		Id:              exercise.ID,
		Name:            exercise.Title,
		Label:           exercise.SubTitle.String,
		RestBetweenSets: restBetweenSets,
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
