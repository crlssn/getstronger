package factory

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
)

func (f *Factory) NewRoutineSlice(count int, opts ...RoutineOpt) orm.RoutineSlice {
	var slice orm.RoutineSlice
	for range count {
		slice = append(slice, f.NewRoutine(opts...))
	}

	return slice
}

type RoutineOpt func(event *orm.Routine)

func (f *Factory) NewRoutine(opts ...RoutineOpt) *orm.Routine {
	m := &orm.Routine{
		ID:            uuid.NewString(),
		UserID:        "",
		Title:         f.faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"}),
		CreatedAt:     time.Time{},
		DeletedAt:     null.Time{},
		ExerciseOrder: nil,
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	insertColumns := boil.Infer()
	updateColumns := boil.Infer()
	conflictColumns := []string{orm.RoutineColumns.ID}
	if err := m.Upsert(context.Background(), f.db, true, conflictColumns, updateColumns, insertColumns); err != nil {
		panic(fmt.Errorf("failed to insert routine: %w", err))
	}

	user, err := m.User().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}

	if err = m.SetUser(context.Background(), f.db, false, user); err != nil {
		panic(fmt.Errorf("failed to set user: %w", err))
	}

	return m
}

func RoutineID(id string) RoutineOpt {
	return func(m *orm.Routine) {
		m.ID = id
	}
}

func RoutineUserID(userID string) RoutineOpt {
	return func(m *orm.Routine) {
		m.UserID = userID
	}
}

func RoutineName(name string) RoutineOpt {
	return func(m *orm.Routine) {
		m.Title = name
	}
}

func RoutineExerciseOrder(exerciseIDs []string) RoutineOpt {
	return func(m *orm.Routine) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			panic(fmt.Errorf("failed to marshal exercise order: %w", err))
		}
		m.ExerciseOrder = bytes
	}
}

func (f *Factory) AddRoutineExercise(routine *orm.Routine, exercises ...*orm.Exercise) {
	if err := routine.AddExercises(context.Background(), f.db, false, exercises...); err != nil {
		panic(fmt.Errorf("failed to add exercises to routine: %w", err))
	}
}
