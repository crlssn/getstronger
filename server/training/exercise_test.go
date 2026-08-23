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

func TestNewOccurrenceRestSeconds(t *testing.T) {
	t.Parallel()

	require.Equal(t, int32(training.DefaultRestSeconds), training.NewOccurrenceRestSeconds(nil))
	require.Equal(t, int32(training.DefaultRestSeconds), training.NewOccurrenceRestSeconds(training.DefaultMetrics()))

	// An exercise held against the clock is one continuous effort, so a new
	// occurrence of it starts with no timer at all.
	require.Equal(t, int32(0), training.NewOccurrenceRestSeconds([]training.Metric{training.MetricTime}))
	require.Equal(t, int32(0), training.NewOccurrenceRestSeconds(
		[]training.Metric{training.MetricDistance, training.MetricTime},
	))
}

func TestMetricsFromStrings(t *testing.T) {
	t.Parallel()

	require.Equal(t, training.DefaultMetrics(), training.MetricsFromStrings([]string{"weight", "reps"}))
	require.Empty(t, training.MetricsFromStrings(nil))
}

func TestMetricsLocked(t *testing.T) {
	t.Parallel()

	stored := []training.Metric{training.MetricWeight, training.MetricReps}

	t.Run("an exercise nobody has logged stays free to change", func(t *testing.T) {
		t.Parallel()
		require.False(t, training.MetricsLocked(stored, []training.Metric{training.MetricTime}, false))
	})

	t.Run("logged sets keep the measurements they were recorded under", func(t *testing.T) {
		t.Parallel()
		require.True(t, training.MetricsLocked(stored, []training.Metric{
			training.MetricDistance, training.MetricTime,
		}, true))
	})

	t.Run("asking for what is already measured changes nothing", func(t *testing.T) {
		t.Parallel()
		require.False(t, training.MetricsLocked(stored, []training.Metric{
			training.MetricWeight, training.MetricReps,
		}, true))
	})

	t.Run("a reordering is not a change", func(t *testing.T) {
		t.Parallel()
		require.False(t, training.MetricsLocked(stored, []training.Metric{
			training.MetricReps, training.MetricWeight,
		}, true))
	})

	t.Run("dropping one of the measurements is a change", func(t *testing.T) {
		t.Parallel()
		require.True(t, training.MetricsLocked(stored, []training.Metric{training.MetricWeight}, true))
	})

	t.Run("adding a measurement is a change", func(t *testing.T) {
		t.Parallel()
		require.True(t, training.MetricsLocked(stored, []training.Metric{
			training.MetricWeight, training.MetricReps, training.MetricTime,
		}, true))
	})
}
