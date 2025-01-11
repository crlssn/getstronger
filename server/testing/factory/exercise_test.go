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
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.Title, created.Title)
		require.Equal(t, expected.SubTitle, created.SubTitle)
		require.False(t, expected.DeletedAt.Valid, created.DeletedAt.Valid)
	})

	t.Run("ExerciseID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewExercise(factory.ExerciseID(id))
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("ExerciseUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewExercise(factory.ExerciseUserID(userID))
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("ExerciseTitle", func(t *testing.T) {
		t.Parallel()
		title := gofakeit.Name()
		expected := f.NewExercise(factory.ExerciseTitle(title))
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, title, created.Title)
	})

	t.Run("ExerciseSubTitle", func(t *testing.T) {
		t.Parallel()
		subTitle := gofakeit.Name()
		expected := f.NewExercise(factory.ExerciseSubTitle(subTitle))
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, subTitle, created.SubTitle)
	})

	t.Run("ExerciseDeleted", func(t *testing.T) {
		t.Parallel()
		expected := f.NewExercise(factory.ExerciseDeleted())
		created, err := orm.FindExercise(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.True(t, created.DeletedAt.Valid)
		require.WithinDuration(t, time.Now().UTC(), created.DeletedAt.Time, time.Second)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
