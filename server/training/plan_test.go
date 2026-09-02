package training_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/aarondl/opt/null"
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
		position, err := newPlan().Advance(first)
		require.NoError(t, err)
		require.Equal(t, 1, position)
	})

	t.Run("wraps around to the start of the rotation", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.CurrentPosition = 1
		position, err := plan.Advance(second)
		require.NoError(t, err)
		require.Equal(t, 0, position)
	})

	t.Run("skips the current routine when none is named", func(t *testing.T) {
		t.Parallel()
		position, err := newPlan().Advance(uuid.Nil)
		require.NoError(t, err)
		require.Equal(t, 1, position)
	})

	t.Run("rejects a routine that is not next", func(t *testing.T) {
		t.Parallel()
		_, err := newPlan().Advance(second)
		require.ErrorIs(t, err, training.ErrPlanUnexpectedRoutine)
	})

	t.Run("rejects a paused plan", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.Active = false
		_, err := plan.Advance(first)
		require.ErrorIs(t, err, training.ErrPlanNotActive)
	})

	t.Run("rejects a plan without routines", func(t *testing.T) {
		t.Parallel()
		_, err := (&training.Plan{Active: true}).Advance(uuid.Nil)
		require.ErrorIs(t, err, training.ErrPlanUnexpectedRoutine)
	})

	t.Run("rejects a position past the rotation", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.CurrentPosition = 2
		_, err := plan.Advance(uuid.Nil)
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
		require.Equal(t, 2, plan.PositionAfterReplacing([]uuid.UUID{third, first, second}))
	})

	t.Run("restarts when the current routine is dropped", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, 0, plan.PositionAfterReplacing([]uuid.UUID{first, third}))
	})

	t.Run("restarts when the plan is on no routine", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, 0, (&training.Plan{}).PositionAfterReplacing([]uuid.UUID{first}))
	})
}

func TestRejectsRotation(t *testing.T) {
	t.Parallel()

	require.True(t, training.RejectsRotation(fmt.Errorf("plan create: %w", training.ErrPlanRoutineDeleted)))
	require.True(t, training.RejectsRotation(training.ErrPlanRequiresRoutine))
	require.True(t, training.RejectsRotation(training.ErrPlanRoutineDuplicate))
	require.True(t, training.RejectsRotation(training.ErrPlanRoutineBelongsToAnotherUser))
	require.False(t, training.RejectsRotation(training.ErrPlanNotActive))
	require.False(t, training.RejectsRotation(nil))
}

func TestValidatePlanRotation(t *testing.T) {
	t.Parallel()

	require.NoError(t, training.ValidatePlanRotation([]uuid.UUID{uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())}))
	require.ErrorIs(t, training.ValidatePlanRotation(nil), training.ErrPlanRequiresRoutine)

	duplicate := uuid.Must(uuid.NewV4())
	require.ErrorIs(t, training.ValidatePlanRotation([]uuid.UUID{duplicate, duplicate}), training.ErrPlanRoutineDuplicate)
}

// A rotation may only hold routines its athlete still has, so the two ways that
// can be untrue are named separately: the caller turns one into a permission
// answer and the other into a stale-client one.
func TestValidatePlanRoutine(t *testing.T) {
	t.Parallel()
	userID := uuid.Must(uuid.NewV4())

	require.NoError(t, training.ValidatePlanRoutine(
		&models.Routine{UserID: userID}, userID,
	))

	require.ErrorIs(t,
		training.ValidatePlanRoutine(&models.Routine{UserID: uuid.Must(uuid.NewV4())}, userID),
		training.ErrPlanRoutineBelongsToAnotherUser)

	deleted := &models.Routine{UserID: userID, DeletedAt: null.From(time.Now().UTC())}
	require.ErrorIs(t,
		training.ValidatePlanRoutine(deleted, userID),
		training.ErrPlanRoutineDeleted)
}

func TestPlanRotationWithout(t *testing.T) {
	t.Parallel()

	first, second, third := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	newPlan := func() *training.Plan {
		return &training.Plan{
			Active:          true,
			CurrentPosition: 1,
			Routines:        models.RoutineSlice{routine(first), routine(second), routine(third)},
		}
	}

	t.Run("keeps the plan on the routine it was training", func(t *testing.T) {
		t.Parallel()
		rotation := newPlan().RotationWithout(first)
		require.Equal(t, []uuid.UUID{second, third}, rotation.RoutineIDs)
		require.Equal(t, 0, rotation.CurrentPosition)
		require.True(t, rotation.Active)
	})

	t.Run("leaves a rotation the routine was not in alone", func(t *testing.T) {
		t.Parallel()
		rotation := newPlan().RotationWithout(uuid.Must(uuid.NewV4()))
		require.Equal(t, []uuid.UUID{first, second, third}, rotation.RoutineIDs)
		require.Equal(t, 1, rotation.CurrentPosition)
		require.True(t, rotation.Active)
	})

	t.Run("restarts when the routine it was training is the one removed", func(t *testing.T) {
		t.Parallel()
		rotation := newPlan().RotationWithout(second)
		require.Equal(t, []uuid.UUID{first, third}, rotation.RoutineIDs)
		require.Equal(t, 0, rotation.CurrentPosition)
		require.True(t, rotation.Active)
	})

	t.Run("pauses a plan left with nothing to train", func(t *testing.T) {
		t.Parallel()
		plan := &training.Plan{
			Active:   true,
			Routines: models.RoutineSlice{routine(first)},
		}
		rotation := plan.RotationWithout(first)
		require.Empty(t, rotation.RoutineIDs)
		require.Equal(t, 0, rotation.CurrentPosition)
		require.False(t, rotation.Active)
	})

	t.Run("leaves an already paused plan paused", func(t *testing.T) {
		t.Parallel()
		plan := newPlan()
		plan.Active = false
		require.False(t, plan.RotationWithout(third).Active)
	})
}

// A plan with nothing to train cannot say what comes next, so it may not become
// the plan the athlete is following — the same rule that pauses one whose last
// routine is deleted. See TestPlanRotationWithout.
func TestPlanValidateActivation(t *testing.T) {
	t.Parallel()

	require.NoError(t, (&training.Plan{
		Routines: models.RoutineSlice{routine(uuid.Must(uuid.NewV4()))},
	}).ValidateActivation())

	require.ErrorIs(t, (&training.Plan{}).ValidateActivation(), training.ErrPlanRequiresRoutine)
	require.ErrorIs(t,
		(&training.Plan{Routines: models.RoutineSlice{}}).ValidateActivation(),
		training.ErrPlanRequiresRoutine)
}
