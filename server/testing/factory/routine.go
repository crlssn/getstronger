package factory

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob/dialect/psql/im"
	bobtypes "github.com/stephenafamo/bob/types"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewRoutineSlice(count int, opts ...RoutineOpt) models.RoutineSlice {
	slice := make(models.RoutineSlice, 0, count)
	for range count {
		slice = append(slice, f.NewRoutine(opts...))
	}

	return slice
}

type RoutineOpt func(routine *models.RoutineSetter)

func (f *Factory) NewRoutine(opts ...RoutineOpt) *models.Routine {
	setter := &models.RoutineSetter{
		ID:    omit.From(newUUID()),
		Title: omit.From(f.Faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"})),
	}
	for _, opt := range opts {
		opt(setter)
	}

	ctx := context.Background()
	var user *models.User
	if userID, ok := setter.UserID.Get(); ok {
		var err error
		user, err = models.Users.Query(models.SelectWhere.Users.ID.EQ(userID)).One(ctx, f.exec)
		if err != nil {
			panic(fmt.Errorf("failed to retrieve user: %w", err))
		}
	} else {
		user = f.NewUser()
	}

	mods := []bobfactory.RoutineMod{bobfactory.RoutineMods.WithExistingUser(userWithoutRelationships(user))}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.ID(value))
	}
	if value, ok := setter.Title.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.Title(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.CreatedAt(value))
	}
	if value, ok := setter.DeletedAt.GetNull(); ok {
		mods = append(mods, bobfactory.RoutineMods.DeletedAt(value))
	}
	if value, ok := setter.ExerciseOrder.Get(); ok {
		mods = append(mods, bobfactory.RoutineMods.ExerciseOrder(value))
	}

	template := f.generated.NewRoutine(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	routine, err := models.Routines.Insert(
		setter,
		im.OnConflict(models.Routines.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("failed to create routine with Bob factory: %w", err))
	}
	routine.R = built.R

	return routine
}

func RoutineID(id any) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.ID = omit.From(nativeUUID(id))
	}
}

func RoutineUserID(userID any) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.UserID = omit.From(nativeUUID(userID))
	}
}

func RoutineName(name string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		m.Title = omit.From(name)
	}
}

func RoutineExerciseOrder(exerciseIDs []string) RoutineOpt {
	return func(m *models.RoutineSetter) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			panic(fmt.Errorf("failed to marshal exercise order: %w", err))
		}
		m.ExerciseOrder = omit.From(bobtypes.NewJSON[json.RawMessage](bytes))
	}
}

func (f *Factory) AddRoutineExercise(routine *models.Routine, exercises ...*models.Exercise) {
	ctx := context.Background()
	for _, exercise := range exercises {
		f.generated.NewExercisesRoutine(
			bobfactory.ExercisesRoutineMods.WithExistingRoutine(routineWithoutRelationships(routine)),
			bobfactory.ExercisesRoutineMods.WithExistingExercise(exerciseWithoutRelationships(exercise)),
		).MustCreate(ctx, f.exec)
	}
}
