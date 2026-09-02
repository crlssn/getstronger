package training_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/training"
)

func exercise(id uuid.UUID) *models.Exercise {
	return &models.Exercise{ID: id}
}

func TestResolveRoutineExercises(t *testing.T) {
	t.Parallel()

	first, second := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	available := models.ExerciseSlice{exercise(first), exercise(second)}

	t.Run("arranges the exercises as requested", func(t *testing.T) {
		t.Parallel()
		resolved, err := training.ResolveRoutineExercises(available, []uuid.UUID{second, first})
		require.NoError(t, err)
		require.Equal(t, models.ExerciseSlice{exercise(second), exercise(first)}, resolved)
	})

	t.Run("rejects an exercise the athlete cannot use", func(t *testing.T) {
		t.Parallel()
		_, err := training.ResolveRoutineExercises(models.ExerciseSlice{exercise(first)}, []uuid.UUID{first, second})
		require.ErrorIs(t, err, training.ErrRoutineExerciseUnknown)
	})

	t.Run("rejects a repeated exercise", func(t *testing.T) {
		t.Parallel()
		_, err := training.ResolveRoutineExercises(models.ExerciseSlice{exercise(first)}, []uuid.UUID{first, first})
		require.ErrorIs(t, err, training.ErrRoutineExerciseUnknown)
	})
}

func TestValidateExerciseOrder(t *testing.T) {
	t.Parallel()

	first, second, third := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	current := models.ExerciseSlice{exercise(first), exercise(second)}

	require.NoError(t, training.ValidateExerciseOrder(current, []uuid.UUID{second, first}))
	require.ErrorIs(t, training.ValidateExerciseOrder(current, []uuid.UUID{first}), training.ErrRoutineExerciseOrderMismatch)
	require.ErrorIs(t, training.ValidateExerciseOrder(current, []uuid.UUID{first, third}), training.ErrRoutineExerciseOrderMismatch)
}

func TestOrderExercisesByIDs(t *testing.T) {
	t.Parallel()

	first, second, unknown := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	exercises := models.ExerciseSlice{exercise(first), exercise(second)}

	ordered := training.OrderExercisesByIDs(exercises, []uuid.UUID{second, unknown, second, first})
	require.Equal(t, models.ExerciseSlice{exercise(second), exercise(first)}, ordered)
}

func TestOrderRoutinesByIDs(t *testing.T) {
	t.Parallel()

	first, second, unknown := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	routines := models.RoutineSlice{routine(first), routine(second)}

	ordered := training.OrderRoutinesByIDs(routines, []uuid.UUID{second, unknown, second, first})
	require.Equal(t, models.RoutineSlice{routine(second), routine(first)}, ordered)
}

func TestNextRoutine(t *testing.T) {
	t.Parallel()

	planned, preferred, first := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	routines := models.RoutineSlice{routine(first), routine(preferred)}
	activePlan := &training.Plan{Active: true, Routines: models.RoutineSlice{routine(planned)}}

	t.Run("the active plan decides", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, planned, training.NextRoutine(activePlan, routines, preferred).ID)
	})

	t.Run("without a plan the athlete's last choice stands", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, preferred, training.NextRoutine(nil, routines, preferred).ID)
	})

	t.Run("falls back to the first routine", func(t *testing.T) {
		t.Parallel()
		require.Equal(t, first, training.NextRoutine(nil, routines, uuid.Nil).ID)
		require.Equal(t, first, training.NextRoutine(nil, routines, uuid.Must(uuid.NewV4())).ID)
	})

	t.Run("offers nothing to an athlete without routines", func(t *testing.T) {
		t.Parallel()
		require.Nil(t, training.NextRoutine(nil, nil, uuid.Nil))
	})
}
