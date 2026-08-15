//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Exercise(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewExerciseSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewExercise()
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.Title, created.Title)
		require.Equal(t, expected.Tags, created.Tags)
		require.True(t, created.DeletedAt.IsNull())
	})

	t.Run("ExerciseID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewExercise(factory.ExerciseID(id))
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID.String())
	})

	t.Run("ExerciseUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewExercise(factory.ExerciseUserID(userID))
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("ExerciseTitle", func(t *testing.T) {
		t.Parallel()
		title := gofakeit.Name()
		expected := f.NewExercise(factory.ExerciseTitle(title))
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, title, created.Title)
	})

	t.Run("ExerciseTags", func(t *testing.T) {
		t.Parallel()
		tags := []string{gofakeit.Word(), gofakeit.Word()}
		expected := f.NewExercise(factory.ExerciseTags(tags...))
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, tags, []string(created.Tags))
	})

	t.Run("ExerciseCreatedAt", func(t *testing.T) {
		t.Parallel()
		now := time.Now()
		expected := f.NewExercise(factory.ExerciseCreatedAt(now))
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, now.UTC().Truncate(time.Microsecond), created.CreatedAt.Truncate(time.Microsecond))
	})

	t.Run("ExerciseDeleted", func(t *testing.T) {
		t.Parallel()
		expected := f.NewExercise(factory.ExerciseDeleted())
		created, err := models.FindExercise(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.False(t, created.DeletedAt.IsNull())
		require.WithinDuration(t, time.Now().UTC(), created.DeletedAt.GetOrZero().UTC(), time.Second)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
