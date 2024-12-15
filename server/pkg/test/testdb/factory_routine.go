package testdb

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

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

	boil.DebugMode = f.debug
	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert routine: %w", err))
	}
	boil.DebugMode = false

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
