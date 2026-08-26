package main

import (
	"context"
	"testing"

	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestCaptureAndRestore(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	f := factory.NewFactory(c.DB)
	user := f.NewUser()
	exercise := f.NewExercise(factory.ExerciseUserID(user.ID))
	workout := f.NewWorkout(factory.WorkoutUserID(user.ID))
	set := f.NewSet(
		factory.SetUserID(user.ID),
		factory.SetWorkoutID(workout.ID),
		factory.SetExerciseID(exercise.ID),
	)

	require.NoError(t, capture(ctx, c.DB))

	// What a spec file does to the seeded data: it removes some of it and adds
	// rows of its own.
	f.NewWorkout(factory.WorkoutUserID(user.ID))
	_, err := models.Sets.Delete(models.DeleteWhere.Sets.ID.EQ(set.ID)).Exec(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)

	require.NoError(t, restore(ctx, c.DB))

	// Sets reference both workouts and exercises, so a restore that put the
	// tables back in the wrong order would not reach this assertion.
	restoredSets, err := models.Sets.Query().All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, restoredSets, 1)
	require.Equal(t, set.ID, restoredSets[0].ID)
	require.Equal(t, workout.ID, restoredSets[0].WorkoutID)
	require.Equal(t, exercise.ID, restoredSets[0].ExerciseID)

	restoredWorkouts, err := models.Workouts.Query().All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, restoredWorkouts, 1)
	require.Equal(t, workout.ID, restoredWorkouts[0].ID)
}

func TestRestoreRepeatedly(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	f := factory.NewFactory(c.DB)
	user := f.NewUser()
	f.NewWorkout(factory.WorkoutUserID(user.ID))

	require.NoError(t, capture(ctx, c.DB))

	// One restore per spec file, all from the same capture: the second must
	// leave the same rows as the first rather than doubling them.
	for range 3 {
		require.NoError(t, restore(ctx, c.DB))

		workoutCount, err := models.Workouts.Query().Count(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.Equal(t, int64(1), workoutCount)
	}
}

func TestRestoreWithoutCapture(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	require.ErrorIs(t, restore(ctx, c.DB), errNoSnapshot)
}

func TestDrop(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	require.NoError(t, capture(ctx, c.DB))
	require.NoError(t, drop(ctx, c.DB))
	require.ErrorIs(t, restore(ctx, c.DB), errNoSnapshot)

	// Dropping what is not there is what a run that was interrupted before its
	// teardown leaves behind.
	require.NoError(t, drop(ctx, c.DB))
}

func TestRunRejectsAnUnknownMode(t *testing.T) {
	t.Parallel()

	require.ErrorIs(t, run(context.Background(), nil, "rollback"), errUnknownMode)
}
