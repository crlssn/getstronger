package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/dialect"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/distanceunit"
	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/safe"
	"github.com/crlssn/getstronger/server/weightunit"
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
	setter, built := f.newSetSetter(opts...)
	set, err := models.Sets.Insert(
		setter,
		setConflictUpdate(setter),
	).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("create set with Bob factory: %w", err))
	}
	set.R = built.R

	return set
}

// NewSetBatch inserts one set per opt list in a single statement. The seed
// creates a couple of thousand sets, which one at a time would each pay a
// network round trip. Every opt list in a batch must set the same fields.
func (f *Factory) NewSetBatch(optss ...[]SetOpt) models.SetSlice {
	if len(optss) == 0 {
		return nil
	}

	mods := make([]bob.Mod[*dialect.InsertQuery], 0, len(optss)+1)
	var first *models.SetSetter
	for _, opts := range optss {
		setter, _ := f.newSetSetter(opts...)
		if first == nil {
			first = setter
		}
		mods = append(mods, setter)
	}
	mods = append(mods, setConflictUpdate(first))

	sets, err := models.Sets.Insert(mods...).All(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("create set batch with Bob factory: %w", err))
	}

	return sets
}

func setConflictUpdate(setter *models.SetSetter) bob.Mod[*dialect.InsertQuery] {
	return im.OnConflict(models.Sets.Columns.ID.Name()).
		DoUpdate(im.SetExcluded(setter.SetColumns()...))
}

func (f *Factory) newSetSetter(opts ...SetOpt) (*models.SetSetter, *models.Set) { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
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

	var workout *models.Workout
	if workoutID, ok := setter.WorkoutID.Get(); ok {
		workout = f.mustWorkout(workoutID)
	} else {
		workout = f.NewWorkout()
	}

	var exercise *models.Exercise
	if exerciseID, ok := setter.ExerciseID.Get(); ok {
		exercise = f.mustExercise(exerciseID)
	} else {
		exercise = f.NewExercise()
	}

	mods := []bobfactory.SetMod{
		bobfactory.SetMods.WithExistingWorkout(workoutWithoutRelationships(workout)),
		bobfactory.SetMods.WithExistingExercise(exerciseWithoutRelationships(exercise)),
		bobfactory.SetMods.WeightUnit(string(weightunit.Kilograms)),
		bobfactory.SetMods.DistanceUnit(string(distanceunit.Kilometers)),
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
	if value, ok := setter.WeightUnit.Get(); ok {
		mods = append(mods, bobfactory.SetMods.WeightUnit(value))
	}
	if value, ok := setter.DistanceUnit.Get(); ok {
		mods = append(mods, bobfactory.SetMods.DistanceUnit(value))
	}

	template := f.generated.NewSet(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.WorkoutID = omit.From(built.WorkoutID)
	setter.ExerciseID = omit.From(built.ExerciseID)

	return setter, built
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

func SetWeightUnit(unit weightunit.Unit) SetOpt {
	return func(set *models.SetSetter) {
		set.WeightUnit = omit.From(string(unit))
	}
}

func SetDistance(distance float64) SetOpt {
	return func(set *models.SetSetter) {
		set.Distance = omit.From(distance)
	}
}

func SetDurationSeconds(seconds int) SetOpt {
	return func(set *models.SetSetter) {
		set.DurationSeconds = omit.From(safe.Int32FromInt(seconds))
	}
}

func SetDistanceUnit(unit distanceunit.Unit) SetOpt {
	return func(set *models.SetSetter) {
		set.DistanceUnit = omit.From(string(unit))
	}
}

func SetCreatedAt(createdAt time.Time) SetOpt {
	return func(set *models.SetSetter) {
		set.CreatedAt = omit.From(createdAt)
	}
}
