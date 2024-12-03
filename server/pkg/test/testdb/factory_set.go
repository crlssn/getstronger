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
	maxWeight := 100
	maxReps := 10

	set := &orm.Set{
		ID:         uuid.NewString(),
		WorkoutID:  f.NewWorkout().ID,
		ExerciseID: f.NewExercise().ID,
		Weight:     f.faker.Float64Range(1, float64(maxWeight)),
		Reps:       f.faker.IntRange(1, maxReps),
		CreatedAt:  time.Time{},
	}

	for _, opt := range opts {
		opt(set)
	}

	boil.DebugMode = f.debug
	if err := set.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert set: %w", err))
	}
	boil.DebugMode = false

	return set
}

func SetExerciseID(exerciseID string) SetOpt {
	return func(set *orm.Set) {
		set.ExerciseID = exerciseID
	}
}

func SetWorkoutID(workoutID string) SetOpt {
	return func(set *orm.Set) {
		set.WorkoutID = workoutID
	}
}

func SetReps(reps int) SetOpt {
	return func(set *orm.Set) {
		set.Reps = reps
	}
}

func SetWeight(weight float64) SetOpt {
	return func(set *orm.Set) {
		set.Weight = weight
	}
}

func SetCreatedAt(createdAt time.Time) SetOpt {
	return func(set *orm.Set) {
		set.CreatedAt = createdAt
	}
}
