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

// The exercise titles the seed uses, spelled the way the library in exercises/
// spells them. A persona training "RDL" while the library calls the movement a
// Romanian deadlift is the drift the library exists to stop, so the two are
// kept in step and exercise_library_test.go fails when they part.
const (
	TitleBenchPress       = "Barbell bench press"
	TitleBackSquat        = "Barbell back squat"
	TitleDeadlift         = "Barbell deadlift"
	TitleBarbellRow       = "Barbell row"
	TitleOverheadPress    = "Barbell overhead press"
	TitlePullUp           = "Pull-up"
	TitlePushUp           = "Push-up"
	TitleWalkingLunge     = "Dumbbell walking lunge"
	TitleLatPulldown      = "Lat pulldown"
	TitleDumbbellCurl     = "Dumbbell curl"
	TitleRomanianDeadlift = "Barbell Romanian deadlift"
	TitleRun              = "Run"
)

// The titles a seeded exercise is drawn from. Fixtures that need a particular
// one ask for it with ExerciseTitle. All of them measure weight and reps,
// which is what a seeded set is logged in.
func exerciseTitles() []string {
	return []string{
		TitleBenchPress, TitleBackSquat, TitleDeadlift, TitleBarbellRow, TitleOverheadPress,
		TitlePullUp, TitlePushUp, TitleWalkingLunge, TitleLatPulldown, TitleDumbbellCurl,
	}
}

// SeedExerciseTitles is every exercise title a seeded persona trains, the ones
// drawn at random and the ones named outright.
func SeedExerciseTitles() []string {
	return append(exerciseTitles(), TitleRomanianDeadlift, TitleRun)
}

func (f *Factory) NewExercise(opts ...ExerciseOpt) *models.Exercise {
	setter := &models.ExerciseSetter{
		ID:    omit.From(newUUID()),
		Title: omit.From(f.Faker.RandomString(exerciseTitles())),
		Tags:  omit.From(pq.StringArray{}),
	}
	for _, opt := range opts {
		opt(setter)
	}

	ctx := context.Background()
	var user *models.User
	if userID, ok := setter.UserID.Get(); ok {
		user = f.mustUser(userID)
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
	f.remember(exercise.ID, exercise)

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
