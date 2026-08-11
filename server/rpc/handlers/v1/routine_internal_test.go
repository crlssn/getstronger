package v1

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
)

func TestReconcileRoutineExercises(t *testing.T) {
	t.Parallel()

	exercises := models.ExerciseSlice{
		{ID: uuid.FromStringOrNil("11111111-1111-1111-1111-111111111111"), Title: "First"},
		{ID: uuid.FromStringOrNil("22222222-2222-2222-2222-222222222222"), Title: "Second"},
		{ID: uuid.FromStringOrNil("33333333-3333-3333-3333-333333333333"), Title: "Third"},
	}

	tests := []struct {
		name         string
		encodedOrder []byte
		expectedIDs  []string
	}{
		{
			name:         "preserves complete order",
			encodedOrder: []byte(`["33333333-3333-3333-3333-333333333333","11111111-1111-1111-1111-111111111111","22222222-2222-2222-2222-222222222222"]`),
			expectedIDs:  []string{"33333333-3333-3333-3333-333333333333", "11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"},
		},
		{
			name:         "appends exercises omitted from order",
			encodedOrder: []byte(`["22222222-2222-2222-2222-222222222222"]`),
			expectedIDs:  []string{"22222222-2222-2222-2222-222222222222", "11111111-1111-1111-1111-111111111111", "33333333-3333-3333-3333-333333333333"},
		},
		{
			name:         "falls back to relationship order when order is empty",
			encodedOrder: []byte(`[]`),
			expectedIDs:  []string{"11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333"},
		},
		{
			name:         "ignores stale and duplicate IDs",
			encodedOrder: []byte(`["99999999-9999-9999-9999-999999999999","11111111-1111-1111-1111-111111111111","11111111-1111-1111-1111-111111111111"]`),
			expectedIDs:  []string{"11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222", "33333333-3333-3333-3333-333333333333"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := reconcileRoutineExercises(exercises, test.encodedOrder)
			require.NoError(t, err)

			actualIDs := make([]string, 0, len(actual))
			for _, exercise := range actual {
				actualIDs = append(actualIDs, exercise.ID.String())
			}
			require.Equal(t, test.expectedIDs, actualIDs)
		})
	}
}

func TestReconcileRoutineExercisesRejectsMalformedOrder(t *testing.T) {
	t.Parallel()

	_, err := reconcileRoutineExercises(nil, []byte(`not-json`))
	require.Error(t, err)
}
