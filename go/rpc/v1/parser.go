package v1

import (
	"github.com/crlssn/getstronger/go/pkg/orm"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
)

func parseExerciseSliceToPB(exercises orm.ExerciseSlice) []*v1.Exercise {
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
