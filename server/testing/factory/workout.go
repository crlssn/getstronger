package factory

import (
	"context"
	"fmt"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/stephenafamo/bob/dialect/psql/im"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
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

func (f *Factory) NewWorkout(opts ...WorkoutOpt) *models.Workout { //nolint:cyclop // Maps optional fixture fields to generated Bob mods.
	startedAt := time.Now().UTC()
	setter := &models.WorkoutSetter{
		ID:         omit.From(newUUID()),
		Name:       omit.From(f.Faker.RandomString([]string{"Legs", "Chest", "Back", "Shoulders", "Arms", "Push", "Pull", "Upper Body", "Lower Body", "Full Body"})),
		StartedAt:  omit.From(startedAt),
		FinishedAt: omit.From(startedAt.Add(time.Hour)),
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

	mods := []bobfactory.WorkoutMod{bobfactory.WorkoutMods.WithExistingUser(userWithoutRelationships(user))}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.WorkoutMods.ID(value))
	}
	if value, ok := setter.FinishedAt.Get(); ok {
		mods = append(mods, bobfactory.WorkoutMods.FinishedAt(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.WorkoutMods.CreatedAt(value))
	}
	if value, ok := setter.Name.Get(); ok {
		mods = append(mods, bobfactory.WorkoutMods.Name(value))
	}
	if value, ok := setter.StartedAt.Get(); ok {
		mods = append(mods, bobfactory.WorkoutMods.StartedAt(value))
	}
	if value, ok := setter.Note.GetNull(); ok {
		mods = append(mods, bobfactory.WorkoutMods.Note(value))
	}
	if value, ok := setter.RoutineID.GetNull(); ok {
		mods = append(mods, bobfactory.WorkoutMods.RoutineID(value))
	}

	template := f.generated.NewWorkout(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	workout, err := models.Workouts.Insert(
		setter,
		im.OnConflict(models.Workouts.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create workout with Bob factory: %w", err))
	}
	workout.R = built.R
	f.remember(workout.ID, workout)

	return workout
}

func WorkoutID(workoutID any) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.ID = omit.From(nativeUUID(workoutID))
	}
}

func WorkoutUserID(userID any) WorkoutOpt {
	return func(workout *models.WorkoutSetter) {
		workout.UserID = omit.From(nativeUUID(userID))
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
	setter := &models.WorkoutCommentSetter{
		ID:      omit.From(newUUID()),
		Comment: omit.From(f.Faker.Sentence(5)), //nolint:mnd
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

	var workout *models.Workout
	if workoutID, ok := setter.WorkoutID.Get(); ok {
		workout = f.mustWorkout(workoutID)
	} else {
		workout = f.NewWorkout()
	}

	mods := []bobfactory.WorkoutCommentMod{
		bobfactory.WorkoutCommentMods.WithExistingUser(userWithoutRelationships(user)),
		bobfactory.WorkoutCommentMods.WithExistingWorkout(workoutWithoutRelationships(workout)),
	}
	if value, ok := setter.ID.Get(); ok {
		mods = append(mods, bobfactory.WorkoutCommentMods.ID(value))
	}
	if value, ok := setter.Comment.Get(); ok {
		mods = append(mods, bobfactory.WorkoutCommentMods.Comment(value))
	}
	if value, ok := setter.CreatedAt.Get(); ok {
		mods = append(mods, bobfactory.WorkoutCommentMods.CreatedAt(value))
	}

	template := f.generated.NewWorkoutComment(mods...)
	built := template.Build()
	setter = template.BuildSetter()
	setter.UserID = omit.From(built.UserID)
	setter.WorkoutID = omit.From(built.WorkoutID)
	comment, err := models.WorkoutComments.Insert(
		setter,
		im.OnConflict(models.WorkoutComments.Columns.ID.Name()).
			DoUpdate(im.SetExcluded(setter.SetColumns()...)),
	).One(ctx, f.exec)
	if err != nil {
		panic(fmt.Errorf("create workout comment with Bob factory: %w", err))
	}
	comment.R = built.R

	return comment
}

func WorkoutCommentID(id any) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.ID = omit.From(nativeUUID(id))
	}
}

func WorkoutCommentUserID(userID any) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.UserID = omit.From(nativeUUID(userID))
	}
}

func WorkoutCommentWorkoutID(workoutID any) WorkoutCommentOpt {
	return func(comment *models.WorkoutCommentSetter) {
		comment.WorkoutID = omit.From(nativeUUID(workoutID))
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
