package testdb

import (
	"fmt"
	"time"

	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/go/pkg/orm"
)

type ExerciseOpt func(event *orm.Exercise)

func (f *Factory) NewExercise(opts ...ExerciseOpt) *orm.Exercise {
	m := &orm.Exercise{
		ID:              "",
		UserID:          f.NewUser().ID,
		Title:           "",
		SubTitle:        null.String{},
		RestBetweenSets: null.Int16{},
		CreatedAt:       time.Time{},
		DeletedAt:       null.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if err := m.Insert(f.ctx, f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert exercise: %w", err))
	}

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

func ExerciseRestBetweenSets(restBetweenSets null.Int16) ExerciseOpt {
	return func(m *orm.Exercise) {
		m.RestBetweenSets = restBetweenSets
	}
}

func ExerciseDeleted() ExerciseOpt {
	return func(m *orm.Exercise) {
		m.DeletedAt = null.TimeFrom(time.Now())
	}
}
