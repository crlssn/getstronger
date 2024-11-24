package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type SetOpt func(set *orm.Set)

func (f *Factory) NewSet(opts ...SetOpt) *orm.Set {
	set := &orm.Set{
		ID:         uuid.NewString(),
		WorkoutID:  f.NewWorkout().ID,
		ExerciseID: f.NewExercise().ID,
		Weight:     f.faker.Float32(),
		Reps:       f.faker.Int(),
		CreatedAt:  time.Time{},
	}

	for _, opt := range opts {
		opt(set)
	}

	if err := set.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert set: %w", err))
	}

	return set
}
