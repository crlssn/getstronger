package training_test

import (
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/training"
)

func TestNormalizeMetrics(t *testing.T) {
	t.Parallel()

	t.Run("defaults to a conventional weights lift", func(t *testing.T) {
		t.Parallel()
		metrics, err := training.NormalizeMetrics(nil)
		require.NoError(t, err)
		require.Equal(t, []training.Metric{training.MetricWeight, training.MetricReps}, metrics)
	})

	t.Run("collapses repeated measurements", func(t *testing.T) {
		t.Parallel()
		metrics, err := training.NormalizeMetrics([]training.Metric{
			training.MetricTime, training.MetricDistance, training.MetricTime,
		})
		require.NoError(t, err)
		require.Equal(t, []training.Metric{training.MetricTime, training.MetricDistance}, metrics)
	})

	t.Run("rejects an unrecognised measurement", func(t *testing.T) {
		t.Parallel()
		_, err := training.NormalizeMetrics([]training.Metric{training.MetricWeight, ""})
		require.ErrorIs(t, err, training.ErrInvalidExerciseMetric)
	})
}

func TestMetricStrings(t *testing.T) {
	t.Parallel()

	require.Equal(t, []string{"weight", "reps"}, training.MetricStrings(training.DefaultMetrics()))
}

func TestNormalizeExerciseTags(t *testing.T) {
	t.Parallel()

	atLimit := make([]string, training.MaxExerciseTags)
	for index := range atLimit {
		atLimit[index] = fmt.Sprintf(" tag %d ", index)
	}
	normalized, err := training.NormalizeExerciseTags(atLimit)
	require.NoError(t, err)
	require.Len(t, normalized, training.MaxExerciseTags)
	require.Equal(t, "tag 0", normalized[0])

	tags, err := training.NormalizeExerciseTags([]string{" Chest ", "Triceps"})
	require.NoError(t, err)
	require.Equal(t, []string{"Chest", "Triceps"}, tags)

	_, err = training.NormalizeExerciseTags([]string{"Chest", "chest"})
	require.ErrorIs(t, err, training.ErrInvalidExerciseTags)

	_, err = training.NormalizeExerciseTags([]string{"Chest", "  "})
	require.ErrorIs(t, err, training.ErrInvalidExerciseTags)

	tooMany := make([]string, training.MaxExerciseTags+1)
	for i := range tooMany {
		tooMany[i] = string(rune('a' + i))
	}
	_, err = training.NormalizeExerciseTags(tooMany)
	require.ErrorIs(t, err, training.ErrInvalidExerciseTags)
}

func TestRestSeconds(t *testing.T) {
	t.Parallel()

	require.Equal(t, training.DefaultRestSeconds, training.RestSeconds(0, nil))
	require.Equal(t, 45, training.RestSeconds(45, nil))
	require.Equal(t, 0, training.RestSeconds(0, []training.Metric{training.MetricTime}))
}
