//nolint:contextcheck
package factory_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestFactory_Plan(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	f := factory.NewFactory(c.DB)

	t.Run("Default", func(t *testing.T) {
		t.Parallel()
		plan := f.NewPlan()
		stored, err := models.FindPlan(ctx, bob.NewDB(c.DB), plan.ID)
		require.NoError(t, err)
		require.NotEmpty(t, stored.Name)
		require.False(t, stored.Active)
		require.Equal(t, int32(0), stored.CurrentPosition)
	})

	t.Run("Options", func(t *testing.T) {
		t.Parallel()
		user := f.NewUser()
		plan := f.NewPlan(
			factory.PlanUserID(user.ID),
			factory.PlanName("Weekly Rotation"),
			factory.PlanActive(),
			factory.PlanCurrentPosition(1),
		)
		stored, err := models.FindPlan(ctx, bob.NewDB(c.DB), plan.ID)
		require.NoError(t, err)
		require.Equal(t, user.ID, stored.UserID)
		require.Equal(t, "Weekly Rotation", stored.Name)
		require.True(t, stored.Active)
		require.Equal(t, int32(1), stored.CurrentPosition)
	})

	t.Run("Routines", func(t *testing.T) {
		t.Parallel()
		user := f.NewUser()
		plan := f.NewPlan(factory.PlanUserID(user.ID))
		routines := f.NewRoutineSlice(2, factory.RoutineUserID(user.ID))
		f.AddPlanRoutine(plan, routines...)
		f.AddPlanRoutine(plan, f.NewRoutine(factory.RoutineUserID(user.ID)))

		stored, err := models.PlanRoutines.Query(
			models.SelectWhere.PlanRoutines.PlanID.EQ(plan.ID),
			sm.OrderBy(models.PlanRoutines.Columns.Position),
		).All(ctx, bob.NewDB(c.DB))
		require.NoError(t, err)
		require.Len(t, stored, 3)
		for position, planRoutine := range stored {
			require.Equal(t, int32(position), planRoutine.Position)
		}
		require.Equal(t, routines[0].ID, stored[0].RoutineID)
		require.Equal(t, routines[1].ID, stored[1].RoutineID)
	})
}
