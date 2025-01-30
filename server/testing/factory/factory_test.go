package factory_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/orm"
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

	exists, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).Exists(ctx, c.DB)
	require.NoError(t, err)
	require.True(t, exists)

	count, err := orm.Users().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = orm.Exercises().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = orm.Routines().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = orm.Workouts().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = orm.Sets().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	count, err = orm.WorkoutComments().Count(ctx, c.DB)
	require.NoError(t, err)
	require.Equal(t, int64(2), count)

	t.Cleanup(func() {
		if err = c.Terminate(ctx); err != nil {
			t.Fatal(fmt.Errorf("failed to terminate container: %w", err))
		}
	})
}

func TestFactory_Now(t *testing.T) {
	t.Parallel()

	actual := time.Now().UTC()
	expected := factory.Now()

	require.WithinRange(t, expected, actual.Add(-time.Microsecond), actual.Add(time.Microsecond))
	require.WithinDuration(t, expected, actual, time.Microsecond)
}
