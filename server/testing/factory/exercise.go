package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/im"

	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewExerciseSlice(count int, opts ...ExerciseOpt) models.ExerciseSlice {
	slice := make(models.ExerciseSlice, 0, count)
	for range count {
		slice = append(slice, f.NewExercise(opts...))
	}

	return slice
}

type ExerciseOpt func(event *models.ExerciseSetter)

func (f *Factory) NewExercise(opts ...ExerciseOpt) *models.Exercise {
	m := &models.ExerciseSetter{
		ID:    omit.From(uuid.NewString()),
		Title: omit.From(f.Faker.RandomString([]string{"Bench Press", "Deadlifts", "Squats", "Pull-Ups", "Push-Ups", "Shoulder Press", "Rows", "Plank", "Burpees", "Lunges"})),
		Tags:  omit.From(pq.StringArray{}),
	}

	for _, opt := range opts {
		opt(m)
	}

	if m.UserID.IsUnset() {
		m.UserID = omit.From(f.NewUser().ID)
	}

	ctx := context.Background()
	exercise, err := models.Exercises.Insert(m,
		im.OnConflict(models.Exercises.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(m.SetColumns()...)),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to insert exercise: %w", err))
	}

	user, err := models.Users.Query(
		models.SelectWhere.Users.ID.EQ(exercise.UserID),
	).One(ctx, bob.NewDB(f.db))
	if err != nil {
		panic(fmt.Errorf("failed to retrieve user: %w", err))
	}
	exercise.R.User = user
	exercise.R.Loaded.User = true

	return exercise
}

func ExerciseID(id string) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.ID = omit.From(id)
	}
}

func ExerciseUserID(userID string) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.UserID = omit.From(userID)
	}
}

func ExerciseTitle(title string) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.Title = omit.From(title)
	}
}

func ExerciseTags(tags ...string) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.Tags = omit.From(pq.StringArray(tags))
	}
}

func ExerciseCreatedAt(t time.Time) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.CreatedAt = omit.From(t.UTC())
	}
}

func ExerciseDeleted() ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.DeletedAt = omitnull.From(time.Now().UTC())
	}
}
