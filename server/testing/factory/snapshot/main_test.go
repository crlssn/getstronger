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

// A table the capture skipped is the failure nobody would see: the restore
// would leave it empty, and whichever spec file ran next would fail on rows it
// never wrote. The snapshot has to mirror the live schema exactly.
func TestCaptureCoversTheWholeSchema(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})

	require.NoError(t, capture(ctx, c.DB))

	live, err := tables(ctx, c.DB, "public")
	require.NoError(t, err)
	require.NotEmpty(t, live)
	copied, err := tables(ctx, c.DB, snapshotSchema)
	require.NoError(t, err)
	require.Equal(t, live, copied)

	byName := make(map[string][]string, len(live))
	for _, copiedTable := range live {
		byName[copiedTable.name] = copiedTable.columns
	}
	require.NotContains(t, byName, "schema_migrations")
	require.Contains(t, byName, "users")
	// Postgres computes this one and refuses a value for it, so a restore that
	// named it would fail on the first row.
	require.NotContains(t, byName["users"], "full_name_search")
	require.Contains(t, byName["users"], "name")
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
