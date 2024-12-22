//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Set(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewSetSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewSet()
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.WorkoutID, created.WorkoutID)
		require.Equal(t, expected.ExerciseID, created.ExerciseID)
		require.InEpsilon(t, expected.Weight, created.Weight, 0)
		require.Equal(t, expected.Reps, created.Reps)
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
	})

	t.Run("SetWorkoutID", func(t *testing.T) {
		t.Parallel()
		workoutID := f.NewWorkout().ID
		expected := f.NewSet(factory.SetWorkoutID(workoutID))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, workoutID, created.WorkoutID)
	})

	t.Run("SetID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewSet(factory.SetID(id))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID)
	})

	t.Run("SetUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewSet(factory.SetUserID(userID))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("SetExerciseID", func(t *testing.T) {
		t.Parallel()
		exerciseID := f.NewExercise().ID
		expected := f.NewSet(factory.SetExerciseID(exerciseID))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, exerciseID, created.ExerciseID)
	})

	t.Run("SetReps", func(t *testing.T) {
		t.Parallel()
		reps := 12
		expected := f.NewSet(factory.SetReps(reps))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.Equal(t, reps, created.Reps)
	})

	t.Run("SetWeight", func(t *testing.T) {
		t.Parallel()
		weight := 75.5
		expected := f.NewSet(factory.SetWeight(weight))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.InEpsilon(t, weight, created.Weight, 0)
	})

	t.Run("SetCreatedAt", func(t *testing.T) {
		t.Parallel()
		createdAt := time.Now().Add(-24 * time.Hour)
		expected := f.NewSet(factory.SetCreatedAt(createdAt))
		created, err := orm.FindSet(ctx, c.DB, expected.ID)
		require.NoError(t, err)
		require.WithinDuration(t, createdAt, created.CreatedAt, time.Second)
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
