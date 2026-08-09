package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/safe"
)

func (f *Factory) NewSetSlice(count int, opts ...SetOpt) models.SetSlice {
	slice := make(models.SetSlice, 0, count)
	for range count {
		slice = append(slice, f.NewSet(opts...))
	}

	return slice
}

type SetOpt func(set *models.SetSetter)

func (f *Factory) NewSet(opts ...SetOpt) *models.Set {
	maxReps := 10
	maxWeight := 100

	m := &models.SetSetter{
		Reps:   omit.From(safe.Int32FromInt(f.Faker.IntRange(1, maxReps))),
		Weight: omit.From(float64(f.Faker.IntRange(1, maxWeight))),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.ID.IsUnset() {
		m.ID = omit.From(uuid.NewString())
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	if m.WorkoutID.IsUnset() {
		m.WorkoutID = omit.From(f.NewWorkout().ID)
	}

	if m.ExerciseID.IsUnset() {
		m.ExerciseID = omit.From(f.NewExercise().ID)
	}

	ctx := context.Background()
	set, err := models.Sets.Insert(m,
		im.OnConflict(models.Sets.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert set: %w", err))
	}

	workout, err := models.Workouts.Query(
		models.SelectWhere.Workouts.ID.EQ(set.WorkoutID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve workout: %w", err))
	}
	set.R.Workout = workout
	set.R.Loaded.Workout = true

	exercise, err := models.Exercises.Query(
		models.SelectWhere.Exercises.ID.EQ(set.ExerciseID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve exercise: %w", err))
	}
	set.R.Exercise = exercise
	set.R.Loaded.Exercise = true

	return set
}

func SetID(id string) SetOpt {
	return func(set *models.SetSetter) {
		set.ID = omit.From(id)
	}
}

func SetUserID(userID string) SetOpt {
	return func(set *models.SetSetter) {
		set.UserID = omit.From(userID)
	}
}

func SetExerciseID(exerciseID string) SetOpt {
	return func(set *models.SetSetter) {
		set.ExerciseID = omit.From(exerciseID)
	}
}

func SetWorkoutID(workoutID string) SetOpt {
	return func(set *models.SetSetter) {
		set.WorkoutID = omit.From(workoutID)
	}
}

func SetReps(reps int) SetOpt {
	return func(set *models.SetSetter) {
		set.Reps = omit.From(safe.Int32FromInt(reps))
	}
}

func SetWeight(weight float64) SetOpt {
	return func(set *models.SetSetter) {
		set.Weight = omit.From(weight)
	}
}

func SetCreatedAt(createdAt time.Time) SetOpt {
	return func(set *models.SetSetter) {
		set.CreatedAt = omit.From(createdAt)
	}
}
