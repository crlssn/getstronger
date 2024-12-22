//nolint:cyclop
package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
)

func (f *Factory) NewSetSlice(count int, opts ...SetOpt) orm.SetSlice {
	var slice orm.SetSlice
	for range count {
		slice = append(slice, f.NewSet(opts...))
	}

	return slice
}

type SetOpt func(set *orm.Set)

func (f *Factory) NewSet(opts ...SetOpt) *orm.Set {
	maxReps := 10
	maxWeight := 100

	m := &orm.Set{
		ID:         "",
		UserID:     "",
		WorkoutID:  "",
		ExerciseID: "",
		Reps:       f.faker.IntRange(1, maxReps),
		Weight:     f.faker.Float64Range(1, float64(maxWeight)),
		CreatedAt:  time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.ID == "" {
		m.ID = uuid.NewString()
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	if m.WorkoutID == "" {
		m.WorkoutID = f.NewWorkout().ID
	}

	if m.ExerciseID == "" {
		m.ExerciseID = f.NewExercise().ID
	}

	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert set: %w", err))
	}

	workout, err := m.Workout().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve workout: %w", err))
	}

	if err = m.SetWorkout(context.Background(), f.db, false, workout); err != nil {
		panic(fmt.Errorf("failed to set workout: %w", err))
	}

	exercise, err := m.Exercise().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve exercise: %w", err))
	}

	if err = m.SetExercise(context.Background(), f.db, false, exercise); err != nil {
		panic(fmt.Errorf("failed to set exercise: %w", err))
	}

	return m
}

func SetID(id string) SetOpt {
	return func(set *orm.Set) {
		set.ID = id
	}
}

func SetUserID(userID string) SetOpt {
	return func(set *orm.Set) {
		set.UserID = userID
	}
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
