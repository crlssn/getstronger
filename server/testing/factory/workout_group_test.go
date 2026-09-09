//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_WorkoutGroup(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		workout := f.NewWorkout()
		group := f.NewWorkoutGroup(workout)
		require.Equal(t, workout.ID, group.WorkoutID)
		require.Equal(t, enums.RoutineGroupModeStraight, group.Mode)
		require.Equal(t, int32(0), group.Position)
	})

	t.Run("AppendsAfterTheBlocksTheWorkoutHas", func(t *testing.T) {
		t.Parallel()
		workout := f.NewWorkout()
		f.NewWorkoutGroup(workout)
		second := f.NewWorkoutGroup(workout)
		require.Equal(t, int32(1), second.Position)
	})

	t.Run("Circuit", func(t *testing.T) {
		t.Parallel()
		workout := f.NewWorkout()
		group := f.NewWorkoutGroup(
			workout,
			factory.WorkoutGroupCircuit(15, 60),
			factory.WorkoutGroupRounds(3),
		)
		require.Equal(t, enums.RoutineGroupModeCircuit, group.Mode)
		require.Equal(t, int32(15), group.RestBetweenExercisesSeconds)
		require.Equal(t, int32(60), group.RestBetweenRoundsSeconds)
		require.Equal(t, int32(3), group.Rounds)
	})

	t.Run("Exercises", func(t *testing.T) {
		t.Parallel()
		user := f.NewUser()
		workout := f.NewWorkout(factory.WorkoutUserID(user.ID))
		first := f.NewExercise(factory.ExerciseUserID(user.ID))
		second := f.NewExercise(factory.ExerciseUserID(user.ID))
		group := f.NewWorkoutGroup(workout)

		occurrences := f.AddWorkoutGroupExercise(group, first, second)
		require.Len(t, occurrences, 2)
		require.Equal(t, first.ID, occurrences[0].ExerciseID)
		require.Equal(t, int32(0), occurrences[0].Position)
		require.Equal(t, int32(1), occurrences[1].Position)

		third := f.AddWorkoutGroupExercise(group, f.NewExercise(factory.ExerciseUserID(user.ID)))
		require.Equal(t, int32(2), third[0].Position)

		stored, err := models.WorkoutGroupExercises.Query(
			models.SelectWhere.WorkoutGroupExercises.WorkoutGroupID.EQ(group.ID),
			sm.OrderBy(models.WorkoutGroupExercises.Columns.Position),
		).All(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.Len(t, stored, 3)
	})

	t.Run("SetWorkoutGroupExerciseID", func(t *testing.T) {
		t.Parallel()
		user := f.NewUser()
		workout := f.NewWorkout(factory.WorkoutUserID(user.ID))
		exercise := f.NewExercise(factory.ExerciseUserID(user.ID))
		group := f.NewWorkoutGroup(workout, factory.WorkoutGroupCircuit(0, 30), factory.WorkoutGroupRounds(2))
		occurrence := f.AddWorkoutGroupExercise(group, exercise)[0]

		set := f.NewSet(
			factory.SetUserID(user.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(exercise.ID),
			factory.SetPosition(1),
			factory.SetWorkoutGroupExerciseID(occurrence.ID),
		)

		stored, err := models.FindSet(ctx, bob.NewDB(c.DB), set.ID)
		require.NoError(t, err)
		require.Equal(t, occurrence.ID, stored.WorkoutGroupExerciseID.GetOrZero())
		require.Equal(t, int32(1), stored.Position)
	})

	t.Run("SetWithoutABlockIsUngrouped", func(t *testing.T) {
		t.Parallel()
		set := f.NewSet()
		stored, err := models.FindSet(ctx, bob.NewDB(c.DB), set.ID)
		require.NoError(t, err)
		require.True(t, stored.WorkoutGroupExerciseID.IsNull())
	})
}
