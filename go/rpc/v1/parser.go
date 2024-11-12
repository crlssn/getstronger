package v1

import (
	"github.com/volatiletech/null/v8"

	"github.com/crlssn/getstronger/go/pkg/orm"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
)

func parseExerciseSliceToPB(exercises orm.ExerciseSlice) []*v1.Exercise {
	var pbExercises []*v1.Exercise
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

func parseExerciseFromPB(exercise *v1.Exercise) *orm.Exercise {
	var restBetweenSets null.Int16
	if exercise.RestBetweenSets != nil {
		restBetweenSets = null.NewInt16(int16(exercise.RestBetweenSets.Seconds), exercise.RestBetweenSets.Seconds > 0)
	}

	return &orm.Exercise{
		ID:              exercise.Id,
		Title:           exercise.Name,
		SubTitle:        null.NewString(exercise.Label, exercise.Label != ""),
		RestBetweenSets: null.NewInt16(restBetweenSets.Int16, restBetweenSets.Valid),
	}
}
