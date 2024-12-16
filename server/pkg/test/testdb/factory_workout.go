package testdb

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

type WorkoutOpt func(workout *orm.Workout)

func (f *Factory) NewWorkout(opts ...WorkoutOpt) *orm.Workout {
	m := &orm.Workout{
		ID:         uuid.NewString(),
		Name:       f.faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"}),
		UserID:     "",
		StartedAt:  f.faker.Date(),
		FinishedAt: f.faker.Date(),
		CreatedAt:  time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	boil.DebugMode = f.debug
	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert workout: %w", err))
	}
	boil.DebugMode = false

	return m
}

func WorkoutID(workoutID string) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.ID = workoutID
	}
}

func WorkoutUserID(userID string) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.UserID = userID
	}
}

type WorkoutCommentOpt func(comment *orm.WorkoutComment)

func WorkoutCommentUserID(userID string) WorkoutCommentOpt {
	return func(comment *orm.WorkoutComment) {
		comment.UserID = userID
	}
}

func WorkoutCommentWorkoutID(workoutID string) WorkoutCommentOpt {
	return func(comment *orm.WorkoutComment) {
		comment.WorkoutID = workoutID
	}
}

func (f *Factory) NewWorkoutComment(opts ...WorkoutCommentOpt) *orm.WorkoutComment {
	m := &orm.WorkoutComment{
		ID:        uuid.NewString(),
		UserID:    "",
		WorkoutID: "",
		Comment:   f.faker.Sentence(5),
		CreatedAt: time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.WorkoutID == "" {
		m.WorkoutID = f.NewWorkout().ID
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	boil.DebugMode = f.debug
	if err := m.Insert(context.Background(), f.db, boil.Infer()); err != nil {
		panic(fmt.Errorf("failed to insert workout comment: %w", err))
	}
	boil.DebugMode = false

	return m
}

func WorkoutName(name string) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.Name = name
	}
}
