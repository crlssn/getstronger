package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewWorkoutSlice(count int, opts ...WorkoutOpt) models.WorkoutSlice {
	slice := make(models.WorkoutSlice, 0, count)
	for range count {
		slice = append(slice, f.NewWorkout(opts...))
	}

	return slice
}

type WorkoutOpt func(workout *models.WorkoutSetter)

func (f *Factory) NewWorkout(opts ...WorkoutOpt) *models.Workout {
	startedAt := time.Now().UTC()
	m := &models.WorkoutSetter{
		ID:         omit.From(uuid.NewString()),
		Name:       omit.From(f.Faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"})),
		StartedAt:  omit.From(startedAt),
		FinishedAt: omit.From(startedAt.Add(time.Hour)),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	ctx := context.Background()
	workout, err := models.Workouts.Insert(m,
		im.OnConflict(models.Workouts.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert workout: %w", err))
	}

	user, err := models.Users.Query(
		models.SelectWhere.Users.ID.EQ(workout.UserID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}
	workout.R.User = user
	workout.R.Loaded.User = true

	return workout
}

func WorkoutID(workoutID string) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.ID = omit.From(workoutID)
	}
}

func WorkoutUserID(userID string) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.UserID = omit.From(userID)
	}
}

func WorkoutName(name string) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.Name = omit.From(name)
	}
}

func WorkoutNote(note string) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.Note = omitnull.From(note)
	}
}

func WorkoutCreatedAt(createdAt time.Time) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.CreatedAt = omit.From(createdAt)
	}
}

func WorkoutStartedAt(startedAt time.Time) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.StartedAt = omit.From(startedAt)
	}
}

func WorkoutFinishedAt(finishedAt time.Time) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.FinishedAt = omit.From(finishedAt)
	}
}

func (f *Factory) NewWorkoutCommentSlice(count int, opts ...WorkoutCommentOpt) models.WorkoutCommentSlice {
	slice := make(models.WorkoutCommentSlice, 0, count)
	for range count {
		slice = append(slice, f.NewWorkoutComment(opts...))
	}

	return slice
}

type WorkoutCommentOpt func(comment *models.WorkoutCommentSetter)

func (f *Factory) NewWorkoutComment(opts ...WorkoutCommentOpt) *models.WorkoutComment {
	m := &models.WorkoutCommentSetter{
		ID:      omit.From(uuid.NewString()),
		Comment: omit.From(f.Faker.Sentence(5)), //nolint:mnd
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	if m.WorkoutID.IsUnset() {
		m.WorkoutID = omit.From(f.NewWorkout().ID)
	}

	ctx := context.Background()
	comment, err := models.WorkoutComments.Insert(m,
		im.OnConflict(models.WorkoutComments.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert workout comment: %w", err))
	}

	user, err := models.Users.Query(
		models.SelectWhere.Users.ID.EQ(comment.UserID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}
	comment.R.User = user
	comment.R.Loaded.User = true

	workout, err := models.Workouts.Query(
		models.SelectWhere.Workouts.ID.EQ(comment.WorkoutID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve workout: %w", err))
	}
	comment.R.Workout = workout
	comment.R.Loaded.Workout = true

	return comment
}

func WorkoutCommentID(id string) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.ID = omit.From(id)
	}
}

func WorkoutCommentUserID(userID string) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.UserID = omit.From(userID)
	}
}

func WorkoutCommentWorkoutID(workoutID string) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.WorkoutID = omit.From(workoutID)
	}
}

func WorkoutCommentText(text string) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.Comment = omit.From(text)
	}
}

func WorkoutCommentCreatedAt(createdAt time.Time) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.CreatedAt = omit.From(createdAt.UTC())
	}
}
