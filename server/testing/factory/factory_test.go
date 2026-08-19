package factory_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestUUID(t *testing.T) {
	t.Parallel()

	require.Equal(t, "00000000-0000-0000-0000-000000000000", factory.UUID(0))
	require.Equal(t, "11111111-1111-1111-1111-111111111111", factory.UUID(1))
}

func TestFactory_Seed(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)

	email := gofakeit.Email()

	f := factory.NewFactory(c.DB)
	f.Seed(factory.SeedParams{
		User: &factory.SeedUser{
			Email:     email,
			Password:  "password",
			FirstName: gofakeit.FirstName(),
			LastName:  gofakeit.LastName(),
		},
		UserCount:           1,
		ExerciseCount:       1,
		RoutineCount:        1,
		WorkoutCount:        1,
		WorkoutSetCount:     1,
		WorkoutCommentCount: 1,
	})

	exists, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(email)).Exists(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.True(t, exists)

	count, err := models.Users.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = models.Exercises.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = models.Routines.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = models.Workouts.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = models.Sets.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = models.WorkoutComments.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	rangedUser := f.Seed(factory.SeedParams{
		User: &factory.SeedUser{
			Email:     gofakeit.Email(),
			Password:  "password",
			FirstName: gofakeit.FirstName(),
			LastName:  gofakeit.LastName(),
		},
		ExerciseCount:             4,
		WorkoutCount:              1,
		WorkoutExerciseCount:      3,
		WorkoutSetsPerExerciseMin: 3,
		WorkoutSetsPerExerciseMax: 6,
	})
	require.NotNil(t, rangedUser)
	rangedWorkout, err := models.Workouts.Query(models.SelectWhere.Workouts.UserID.EQ(rangedUser.ID)).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	rangedSets, err := models.Sets.Query(models.SelectWhere.Sets.WorkoutID.EQ(rangedWorkout.ID)).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	setsByExercise := make(map[string]int)
	for _, set := range rangedSets {
		setsByExercise[set.ExerciseID.String()]++
	}
	require.Len(t, setsByExercise, 3)
	for _, setCount := range setsByExercise {
		require.GreaterOrEqual(t, setCount, 3)
		require.LessOrEqual(t, setCount, 6)
	}

	t.Cleanup(func() {
		if err = c.Terminate(ctx); err != nil {
			t.Fatal(fmt.Errorf("terminate container: %w", err))
		}
	})
}

func TestFactory_Now(t *testing.T) {
	t.Parallel()

	actual := time.Now().UTC()
	expected := factory.Now()

	require.WithinRange(t, expected, actual.Add(-time.Second), actual.Add(time.Second))
	require.WithinDuration(t, expected, actual, time.Second)

	f := factory.NewFactory(nil)
	require.Equal(t, f.Now(), f.Now()) //nolint:testifylint
}
