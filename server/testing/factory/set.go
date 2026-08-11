package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/im"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
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

func (f *Factory) NewSet(opts ...SetOpt) *models.Set { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
	const (
		maxReps   = 10
		maxWeight = 100
	)
	setter := &models.SetSetter{
		Reps:   omit.From(safe.Int32FromInt(f.Faker.IntRange(1, maxReps))),
		Weight: omit.From(float64(f.Faker.IntRange(1, maxWeight))),
	}
	for _, opt := range opts {
		opt(setter)
	}
	if setter.ID.IsUnset() {
		setter.ID = omit.From(newUUID())
	}
	if setter.UserID.IsUnset() {
		setter.UserID = omit.From(f.NewUser().ID)
	}

	ctx := context.Background()
	var workout *models.Workout
	if workoutID, ok := setter.WorkoutID.Get(); ok {
		var err error
		workout, err = models.Workouts.Query(models.SelectWhere.Workouts.ID.EQ(workoutID)).One(ctx, f.exec)
		if err != nil {
			panic(fmt.Errorf("failed to retrieve workout: %w", err))
		}
	} else {
		workout = f.NewWorkout()
	}

	var exercise *models.Exercise
	if exerciseID, ok := setter.ExerciseID.Get(); ok {
		var err error
		exercise, err = models.Exercises.Query(models.SelectWhere.Exercises.ID.EQ(exerciseID)).One(ctx, f.exec)
		if err != nil {
			panic(fmt.Errorf("failed to retrieve exercise: %w", err))
		}
	} else {
		exercise = f.NewExercise()
	}

	mods := []bobfactory.SetMod{
		bobfactory.SetMods.WithExistingWorkout(workoutWithoutRelationships(workout)),
		bobfactory.SetMods.WithExistingExercise(exerciseWithoutRelationships(exercise)),
	}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.SetMods.ID(value))
	}
	if value, ok := setter.Weight.Get(); ok {
		mods = append(mods, bobfactory.SetMods.Weight(value))
	}
	if value, ok := setter.Reps.Get(); ok {
		mods = append(mods, bobfactory.SetMods.Reps(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.SetMods.CreatedAt(value))
	}
	if value, ok := setter.UserID.Get(); ok {
		mods = append(mods, bobfactory.SetMods.UserID(value))
	}
	if value, ok := setter.Distance.Get(); ok {
		mods = append(mods, bobfactory.SetMods.Distance(value))
	}
	if value, ok := setter.DurationSeconds.Get(); ok {
		mods = append(mods, bobfactory.SetMods.DurationSeconds(value))
	}

	template := f.generated.NewSet(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.WorkoutID = omit.From(built.WorkoutID)
	setter.ExerciseID = omit.From(built.ExerciseID)
	set, err := models.Sets.Insert(
		setter,
		im.OnConflict(models.Sets.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("failed to create set with Bob factory: %w", err))
	}
	set.R = built.R

	return set
}

func SetID(id any) SetOpt {
	return func(set *models.SetSetter) {
		set.ID = omit.From(nativeUUID(id))
	}
}

func SetUserID(userID any) SetOpt {
	return func(set *models.SetSetter) {
		set.UserID = omit.From(nativeUUID(userID))
	}
}

func SetExerciseID(exerciseID any) SetOpt {
	return func(set *models.SetSetter) {
		set.ExerciseID = omit.From(nativeUUID(exerciseID))
	}
}

func SetWorkoutID(workoutID any) SetOpt {
	return func(set *models.SetSetter) {
		set.WorkoutID = omit.From(nativeUUID(workoutID))
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
