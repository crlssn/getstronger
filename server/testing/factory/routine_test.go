//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Routine(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Slice", func(t *testing.T) {
		t.Parallel()
		slice := f.NewRoutineSlice(3)
		require.Len(t, slice, 3)
	})

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		expected := f.NewRoutine()
		created, err := models.FindRoutine(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, expected.ID, created.ID)
		require.Equal(t, expected.UserID, created.UserID)
		require.Equal(t, expected.Title, created.Title)
		require.Equal(t, expected.DeletedAt.IsNull(), created.DeletedAt.IsNull())
		require.Equal(t, expected.CreatedAt.Truncate(time.Millisecond), created.CreatedAt.Truncate(time.Millisecond))
	})

	t.Run("RoutineID", func(t *testing.T) {
		t.Parallel()
		id := uuid.NewString()
		expected := f.NewRoutine(factory.RoutineID(id))
		created, err := models.FindRoutine(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, id, created.ID.String())
	})

	t.Run("RoutineUserID", func(t *testing.T) {
		t.Parallel()
		userID := f.NewUser().ID
		expected := f.NewRoutine(factory.RoutineUserID(userID))
		created, err := models.FindRoutine(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, userID, created.UserID)
	})

	t.Run("RoutineName", func(t *testing.T) {
		t.Parallel()
		name := "Custom Routine Name"
		expected := f.NewRoutine(factory.RoutineName(name))
		created, err := models.FindRoutine(ctx, bob.NewDB(c.DB), expected.ID)
		require.NoError(t, err)
		require.Equal(t, name, created.Title)
	})

	t.Run("AddRoutineExercise", func(t *testing.T) {
		t.Parallel()
		routine := f.NewRoutine()
		exercises := []*models.Exercise{
			f.NewExercise(),
			f.NewExercise(),
		}

		f.AddRoutineExercise(routine, exercises[0])
		// A second call must continue from the routine's last position rather
		// than restart at one.
		f.AddRoutineExercise(routine, exercises[1])

		require.NoError(t, routine.Reload(ctx, bob.NewDB(c.DB)))
		links, err := models.ExercisesRoutines.Query(
			models.SelectWhere.ExercisesRoutines.RoutineID.EQ(routine.ID),
			sm.OrderBy(models.ExercisesRoutines.Columns.Position).Asc(),
		).All(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.Len(t, links, len(exercises))

		for index, exercise := range exercises {
			require.Equal(t, exercise.ID, links[index].ExerciseID, "positions should follow insertion order")
		}
	})

	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
}
