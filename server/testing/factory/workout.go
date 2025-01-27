package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"

	"github.com/crlssn/getstronger/server/gen/orm"
)

func (f *Factory) NewWorkoutSlice(count int, opts ...WorkoutOpt) orm.WorkoutSlice {
	var slice orm.WorkoutSlice
	for range count {
		slice = append(slice, f.NewWorkout(opts...))
	}

	return slice
}

type WorkoutOpt func(workout *orm.Workout)

func (f *Factory) NewWorkout(opts ...WorkoutOpt) *orm.Workout {
	startedAt := time.Now().UTC()
	m := &orm.Workout{
		ID:         uuid.NewString(),
		Name:       f.faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"}),
		UserID:     "",
		StartedAt:  startedAt,
		FinishedAt: startedAt.Add(time.Hour),
		CreatedAt:  time.Time{},
		Note:       null.String{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	updateColumns := boil.Infer()
	insertColumns := boil.Infer()
	conflictColumns := []string{orm.WorkoutColumns.ID}
	if err := m.Upsert(context.Background(), f.db, true, conflictColumns, updateColumns, insertColumns); err != nil {
		panic(fmt.Errorf("failed to insert workout: %w", err))
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

func WorkoutName(name string) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.Name = name
	}
}

func WorkoutCreatedAt(createdAt time.Time) WorkoutOpt {
	return func(workout *orm.Workout) {
		workout.CreatedAt = createdAt
	}
}

func (f *Factory) NewWorkoutCommentSlice(count int, opts ...WorkoutCommentOpt) orm.WorkoutCommentSlice {
	var slice orm.WorkoutCommentSlice
	for range count {
		slice = append(slice, f.NewWorkoutComment(opts...))
	}

	return slice
}

type WorkoutCommentOpt func(comment *orm.WorkoutComment)

func (f *Factory) NewWorkoutComment(opts ...WorkoutCommentOpt) *orm.WorkoutComment {
	m := &orm.WorkoutComment{
		ID:        uuid.NewString(),
		UserID:    "",
		WorkoutID: "",
		Comment:   f.faker.Sentence(5), //nolint:mnd
		CreatedAt: time.Time{},
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID == "" {
		m.UserID = f.NewUser().ID
	}

	if m.WorkoutID == "" {
		m.WorkoutID = f.NewWorkout().ID
	}

	insertColumns := boil.Infer()
	updateColumns := boil.Infer()
	conflictColumns := []string{orm.WorkoutCommentColumns.ID}
	if err := m.Upsert(context.Background(), f.db, true, conflictColumns, updateColumns, insertColumns); err != nil {
		panic(fmt.Errorf("failed to insert workout comment: %w", err))
	}

	user, err := m.User().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}

	if err = m.SetUser(context.Background(), f.db, false, user); err != nil {
		panic(fmt.Errorf("failed to set user: %w", err))
	}

	workout, err := m.Workout().One(context.Background(), f.db)
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}

	if err = m.SetWorkout(context.Background(), f.db, false, workout); err != nil {
		panic(fmt.Errorf("failed to set user: %w", err))
	}

	return m
}

func WorkoutCommentID(id string) WorkoutCommentOpt {
	return func(comment *orm.WorkoutComment) {
		comment.ID = id
	}
}

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
