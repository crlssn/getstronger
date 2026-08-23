package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/lib/pq"
	"github.com/stephenafamo/bob/dialect/psql/im"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
)

func (f *Factory) NewExerciseSlice(count int, opts ...ExerciseOpt) models.ExerciseSlice {
	slice := make(models.ExerciseSlice, 0, count)
	for range count {
		slice = append(slice, f.NewExercise(opts...))
	}

	return slice
}

type ExerciseOpt func(exercise *models.ExerciseSetter)

func (f *Factory) NewExercise(opts ...ExerciseOpt) *models.Exercise { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
	setter := &models.ExerciseSetter{
		ID:    omit.From(newUUID()),
		Title: omit.From(f.Faker.RandomString([]string{"Bench Press", "Deadlifts", "Squats", "Pull-Ups", "Push-Ups", "Shoulder Press", "Rows", "Plank", "Burpees", "Lunges"})),
		Tags:  omit.From(pq.StringArray{}),
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
			panic(fmt.Errorf("retrieve user: %w", err))
		}
	} else {
		user = f.NewUser()
	}

	mods := []bobfactory.ExerciseMod{bobfactory.ExerciseMods.WithExistingUser(userWithoutRelationships(user))}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.ExerciseMods.ID(value))
	}
	if value, ok := setter.Title.Get(); ok {
		mods = append(mods, bobfactory.ExerciseMods.Title(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.ExerciseMods.CreatedAt(value))
	}
	if value, ok := setter.DeletedAt.GetNull(); ok {
		mods = append(mods, bobfactory.ExerciseMods.DeletedAt(value))
	}
	if value, ok := setter.Tags.Get(); ok {
		mods = append(mods, bobfactory.ExerciseMods.Tags(value))
	}
	if value, ok := setter.Metrics.Get(); ok {
		mods = append(mods, bobfactory.ExerciseMods.Metrics(value))
	}

	template := f.generated.NewExercise(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	exercise, err := models.Exercises.Insert(
		setter,
		im.OnConflict(models.Exercises.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create exercise with Bob factory: %w", err))
	}
	exercise.R = built.R

	return exercise
}

func ExerciseID(id any) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.ID = omit.From(nativeUUID(id))
	}
}

func ExerciseUserID(userID any) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.UserID = omit.From(nativeUUID(userID))
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

func ExerciseMetrics(metrics ...string) ExerciseOpt {
	return func(m *models.ExerciseSetter) {
		m.Metrics = omit.From(pq.StringArray(metrics))
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
