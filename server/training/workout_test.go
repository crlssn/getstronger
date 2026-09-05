package training_test

import (
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/training"
)

func TestNewPeriod(t *testing.T) {
	t.Parallel()

	start := time.Date(2026, time.August, 22, 9, 0, 0, 0, time.UTC)
	finish := start.Add(time.Hour)

	period, err := training.NewPeriod(start, finish)
	require.NoError(t, err)
	require.Equal(t, start, period.StartedAt)
	require.Equal(t, finish, period.FinishedAt)

	_, err = training.NewPeriod(start, start)
	require.NoError(t, err)

	_, err = training.NewPeriod(finish, start)
	require.ErrorIs(t, err, training.ErrWorkoutStartsAfterFinish)
}

func TestWorkoutName(t *testing.T) {
	t.Parallel()

	require.Equal(t, "Push Day", training.WorkoutName("Push Day", "Anything"))
	require.Equal(t, "Anything", training.WorkoutName("", "Anything"))
	require.Equal(t, training.QuickWorkoutName, training.WorkoutName("", ""))
}

func TestTotalVolume(t *testing.T) {
	t.Parallel()

	sets := []*training.Set{
		{Weight: 100, Reps: 5},
		{Weight: 60.5, Reps: 10},
	}

	require.InDelta(t, 1105.0, training.TotalVolume(sets).Float64(), 0.001)
	require.Zero(t, training.TotalVolume(nil))
}

func TestTotalDistance(t *testing.T) {
	t.Parallel()

	sets := []*training.Set{
		{Distance: 5},
		{Distance: 2.5},
	}

	require.InDelta(t, 7.5, training.TotalDistance(sets).Float64(), 0.001)
	require.Zero(t, training.TotalDistance(nil))
}

func TestWeekOfStartsOnMonday(t *testing.T) {
	t.Parallel()

	monday := time.Date(2026, time.August, 17, 0, 0, 0, 0, time.UTC)
	for day := range 7 {
		moment := monday.AddDate(0, 0, day).Add(13 * time.Hour)
		require.Equal(t, monday, training.WeekOf(moment).Start(), "day %d", day)
	}
}

func TestWeekSummarise(t *testing.T) {
	t.Parallel()

	week := training.WeekOf(time.Date(2026, time.August, 19, 12, 0, 0, 0, time.UTC))
	thisWeek := &training.Workout{
		FinishedAt: week.Start().Add(time.Hour),
		Sets:       []*training.Set{{Weight: 100, Reps: 5, Distance: 5}},
	}
	lastWeek := &training.Workout{
		FinishedAt: week.Start().Add(-time.Hour),
		Sets:       []*training.Set{{Weight: 100, Reps: 5, Distance: 5}},
	}

	summary := week.Summarise([]*training.Workout{thisWeek, lastWeek})
	require.Equal(t, int32(1), summary.Workouts)
	require.InDelta(t, 500.0, summary.Volume.Float64(), 0.001)
	require.InDelta(t, 5.0, summary.Distance.Float64(), 0.001)
}

func TestValidateWorkoutExercises(t *testing.T) {
	t.Parallel()

	first, second, foreign := uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4()), uuid.Must(uuid.NewV4())
	owned := []*training.Exercise{exercise(first), exercise(second)}

	t.Run("accepts the athlete's own exercises", func(t *testing.T) {
		t.Parallel()
		require.NoError(t, training.ValidateWorkoutExercises(owned, []uuid.UUID{second, first}))
	})

	t.Run("accepts an exercise trained more than once", func(t *testing.T) {
		t.Parallel()
		require.NoError(t, training.ValidateWorkoutExercises(owned, []uuid.UUID{first, first}))
	})

	t.Run("accepts a workout that logged nothing", func(t *testing.T) {
		t.Parallel()
		require.NoError(t, training.ValidateWorkoutExercises(nil, nil))
	})

	t.Run("rejects another athlete's exercise", func(t *testing.T) {
		t.Parallel()
		err := training.ValidateWorkoutExercises(owned, []uuid.UUID{first, foreign})
		require.ErrorIs(t, err, training.ErrWorkoutExerciseUnknown)
	})
}
