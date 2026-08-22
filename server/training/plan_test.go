package training_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/training"
)

func routine(id uuid.UUID) *models.Routine {
	return &models.Routine{ID: id}
}

func TestPlanCurrentRoutine(t *testing.T) {
	t.Parallel()

	first, second := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	plan := &training.Plan{
		Active:          true,
		CurrentPosition: 1,
		Routines:        models.RoutineSlice{routine(first), routine(second)},
	}

	require.Equal(t, second, plan.CurrentRoutine().ID)

	plan.CurrentPosition = 2
	require.Nil(t, plan.CurrentRoutine())

	plan.CurrentPosition = -1
	require.Nil(t, plan.CurrentRoutine())

	require.Nil(t, (*training.Plan)(nil).CurrentRoutine())
	require.Nil(t, (&training.Plan{}).CurrentRoutine())
}

func TestPlanAdvance(t *testing.T) {
	t.Parallel()

	first, second := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	newPlan := func() *training.Plan {
		return &training.Plan{
			Active:          true,
			CurrentPosition: 0,
			Routines:        models.RoutineSlice{routine(first), routine(second)},
		}
	}

	t.Run("advances to the next routine", func(t *testing.T) {
		t.Parallel()
		position, err := newPlan().Advance(first.String())
		require.NoError(t, err)
		require.Equal(t, 1, position)
	})

	t.Run("wraps around to the start of the rotation", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.CurrentPosition = 1
		position, err := plan.Advance(second.String())
		require.NoError(t, err)
		require.Equal(t, 0, position)
	})

	t.Run("skips the current routine when none is named", func(t *testing.T) {
		t.Parallel()
		position, err := newPlan().Advance("")
		require.NoError(t, err)
		require.Equal(t, 1, position)
	})

	t.Run("rejects a routine that is not next", func(t *testing.T) {
		t.Parallel()
		_, err := newPlan().Advance(second.String())
		require.ErrorIs(t, err, training.ErrPlanUnexpectedRoutine)
	})

	t.Run("rejects a paused plan", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.Active = false
		_, err := plan.Advance(first.String())
		require.ErrorIs(t, err, training.ErrPlanNotActive)
	})

	t.Run("rejects a plan without routines", func(t *testing.T) {
		t.Parallel()
		_, err := (&training.Plan{Active: true}).Advance("")
		require.ErrorIs(t, err, training.ErrPlanUnexpectedRoutine)
	})

	t.Run("rejects a position past the rotation", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.CurrentPosition = 2
		_, err := plan.Advance("")
		require.ErrorIs(t, err, training.ErrPlanUnexpectedRoutine)
	})
}

func TestPlanPositionAfterReplacing(t *testing.T) {
	t.Parallel()

	first, second, third := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	plan := &training.Plan{
		CurrentPosition: 1,
		Routines:        models.RoutineSlice{routine(first), routine(second)},
	}

	t.Run("follows the current routine to its new position", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, 2, plan.PositionAfterReplacing([]string{third.String(), first.String(), second.String()}))
	})

	t.Run("restarts when the current routine is dropped", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, 0, plan.PositionAfterReplacing([]string{first.String(), third.String()}))
	})

	t.Run("restarts when the plan is on no routine", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, 0, (&training.Plan{}).PositionAfterReplacing([]string{first.String()}))
	})
}

func TestValidatePlanRotation(t *testing.T) {
	t.Parallel()

	require.NoError(t, training.ValidatePlanRotation([]string{"a", "b"}))
	require.ErrorIs(t, training.ValidatePlanRotation(nil), training.ErrPlanRequiresRoutine)
	require.ErrorIs(t, training.ValidatePlanRotation([]string{}), training.ErrPlanRequiresRoutine)
	require.ErrorIs(t, training.ValidatePlanRotation([]string{"a", "a"}), training.ErrPlanRoutineDuplicate)
}
