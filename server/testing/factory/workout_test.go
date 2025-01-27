//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Workout(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewWorkoutSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewWorkout()
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.Name, created.Name)
		require.Equal(t, expected.StartedAt.Truncate(time.Millisecond), created.StartedAt.Truncate(time.Millisecond))
		require.Equal(t, expected.FinishedAt.Truncate(time.Millisecond), created.FinishedAt.Truncate(time.Millisecond))
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
		require.True(t, created.StartedAt.Before(created.FinishedAt))
	})

	t.Run("WorkoutID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewWorkout(factory.WorkoutID(id))
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("WorkoutUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewWorkout(factory.WorkoutUserID(userID))
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("WorkoutName", func(t *testing.T) {
		t.Parallel()
		name := gofakeit.Name()
		expected := f.NewWorkout(factory.WorkoutName(name))
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, name, created.Name)
	})

	t.Run("WorkoutNote", func(t *testing.T) {
		t.Parallel()
		note := gofakeit.Word()
		expected := f.NewWorkout(factory.WorkoutNote(note))
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, note, created.Note.String)
	})

	t.Run("WorkoutCreatedAt", func(t *testing.T) {
		t.Parallel()
		createdAt := time.Now().Add(-24 * time.Hour)
		expected := f.NewWorkout(factory.WorkoutCreatedAt(createdAt))
		created, err := orm.FindWorkout(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.WithinDuration(t, createdAt, created.CreatedAt, time.Second)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}

func TestFactory_WorkoutComment(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewWorkoutCommentSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewWorkoutComment()
		created, err := orm.FindWorkoutComment(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.WorkoutID, created.WorkoutID)
		require.Equal(t, expected.Comment, created.Comment)
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
	})

	t.Run("WorkoutCommentID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewWorkoutComment(factory.WorkoutCommentID(id))
		created, err := orm.FindWorkoutComment(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("WorkoutCommentUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewWorkoutComment(factory.WorkoutCommentUserID(userID))
		created, err := orm.FindWorkoutComment(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("WorkoutCommentWorkoutID", func(t *testing.T) {
		t.Parallel()
		workoutID := f.NewWorkout().ID
		expected := f.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workoutID))
		created, err := orm.FindWorkoutComment(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, workoutID, created.WorkoutID)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
