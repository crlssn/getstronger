package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type ExerciseOpt func(event *orm.Exercise)

func (f *Factory) NewExercise(opts ...ExerciseOpt) *orm.Exercise {
	m := &orm.Exercise{
		ID:        uuid.NewString(),
		UserID:    "",
		Title:     f.faker.RandomString([]string{"Bench Press", "Deadlifts", "Squats", "Pull-Ups", "Push-Ups", "Shoulder Press", "Rows", "Plank", "Burpees", "Lunges"}),
		SubTitle:  null.String{},
		CreatedAt: time.Time{},
		DeletedAt: null.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	boil.DebugMode = f.debug
	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert exercise: %w", err))
	}
	boil.DebugMode = false

	return m
}

func ExerciseID(id string) ExerciseOpt {
	return func(m *orm.Exercise) {
		m.ID = id
	}
}

func ExerciseUserID(userID string) ExerciseOpt {
	return func(m *orm.Exercise) {
		m.UserID = userID
	}
}

func ExerciseTitle(title string) ExerciseOpt {
	return func(m *orm.Exercise) {
		m.Title = title
	}
}

func ExerciseSubTitle(subTitle null.String) ExerciseOpt {
	return func(m *orm.Exercise) {
		m.SubTitle = subTitle
	}
}

func ExerciseDeleted() ExerciseOpt {
	return func(m *orm.Exercise) {
		m.DeletedAt = null.TimeFrom(time.Now())
	}
}
