package repo_test

import (
	"context"
	"log"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestPlanLifecycle(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testContainer := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := testContainer.Terminate(ctx); err != nil {
			log.Printf("terminate plan test container: %v", err)
		}
	})

	f := factory.NewFactory(testContainer.DB)
	r := repo.New(testContainer.DB)
	user := f.NewUser()
	lower := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Lower"))
	chest := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Chest"))
	pull := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Pull"))

	plan, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Strength Rotation",
		RoutineIDs: []string{lower.ID, chest.ID, pull.ID},
	})
	require.NoError(t, err)
	require.False(t, plan.Active)
	require.Equal(t, []string{lower.ID, chest.ID, pull.ID}, planRoutineIDs(plan))

	plan, err = r.SetActivePlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	require.True(t, plan.Active)
	require.Zero(t, plan.CurrentPosition)

	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, lower.ID)
	require.NoError(t, err)
	require.Equal(t, 1, plan.CurrentPosition)

	plan, err = r.UpdatePlan(ctx, repo.UpdatePlanParams{
		ID:         plan.ID,
		UserID:     user.ID,
		Name:       "Updated Rotation",
		RoutineIDs: []string{pull.ID, chest.ID, lower.ID},
	})
	require.NoError(t, err)
	require.Equal(t, "Updated Rotation", plan.Name)
	require.Equal(t, 1, plan.CurrentPosition, "the current Chest routine should remain current")

	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, chest.ID)
	require.NoError(t, err)
	require.Equal(t, 2, plan.CurrentPosition)
	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, lower.ID)
	require.NoError(t, err)
	require.Zero(t, plan.CurrentPosition, "the sequence should repeat indefinitely")

	require.NoError(t, r.PauseActivePlan(ctx, user.ID))
	_, err = r.GetActivePlan(ctx, user.ID)
	require.Error(t, err)
}

func planRoutineIDs(plan *repo.TrainingPlan) []string {
	ids := make([]string, 0, len(plan.Routines))
	for _, routine := range plan.Routines {
		ids = append(ids, routine.ID)
	}
	return ids
}
