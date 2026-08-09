package v1

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
)

func TestReconcileRoutineExercises(t *testing.T) {
	t.Parallel()

	exercises := models.ExerciseSlice{
		{ID: "first", Title: "First"},
		{ID: "second", Title: "Second"},
		{ID: "third", Title: "Third"},
	}

	tests := []struct {
		name         string
		encodedOrder []byte
		expectedIDs  []string
	}{
		{
			name:         "preserves complete order",
			encodedOrder: []byte(`["third","first","second"]`),
			expectedIDs:  []string{"third", "first", "second"},
		},
		{
			name:         "appends exercises omitted from order",
			encodedOrder: []byte(`["second"]`),
			expectedIDs:  []string{"second", "first", "third"},
		},
		{
			name:         "falls back to relationship order when order is empty",
			encodedOrder: []byte(`[]`),
			expectedIDs:  []string{"first", "second", "third"},
		},
		{
			name:         "ignores stale and duplicate IDs",
			encodedOrder: []byte(`["missing","first","first"]`),
			expectedIDs:  []string{"first", "second", "third"},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			actual, err := reconcileRoutineExercises(exercises, test.encodedOrder)
			require.NoError(t, err)

			actualIDs := make([]string, 0, len(actual))
			for _, exercise := range actual {
				actualIDs = append(actualIDs, exercise.ID)
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
