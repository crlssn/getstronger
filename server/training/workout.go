package training

import (
	"errors"
	"time"

	"github.com/crlssn/getstronger/server/gen/models"
)

// QuickWorkoutName names a workout logged without following a routine.
const QuickWorkoutName = "Quick Workout"

// ErrWorkoutStartsAfterFinish reports a workout whose clock runs backwards.
var ErrWorkoutStartsAfterFinish = errors.New("workout must start before it finishes")

// ErrWorkoutAlreadySaved reports a save the user already made: the same
// idempotency key was sent again, as a replayed or retried request is.
var ErrWorkoutAlreadySaved = errors.New("workout is already saved")

// Period is the stretch of time a workout occupied.
type Period struct {
	StartedAt  time.Time
	FinishedAt time.Time
}

// NewPeriod rejects a workout that finishes before it starts.
func NewPeriod(startedAt, finishedAt time.Time) (Period, error) {
	if startedAt.After(finishedAt) {
		return Period{}, ErrWorkoutStartsAfterFinish
	}

	return Period{StartedAt: startedAt, FinishedAt: finishedAt}, nil
}

// WorkoutName is the name a finished workout is recorded under: the routine it
// followed if there was one, else whatever the athlete typed, else a generic
// name for an unplanned session.
func WorkoutName(routineTitle, requestedName string) string {
	if routineTitle != "" {
		return routineTitle
	}

	if requestedName != "" {
		return requestedName
	}

	return QuickWorkoutName
}

// Volume is tonnage: the weight moved multiplied by the number of times it was
// moved. It is the single measure of how much work a set, a workout or a week
// of workouts represents.
type Volume float64

// Float64 renders the volume for callers that report it numerically.
func (v Volume) Float64() float64 {
	return float64(v)
}

// TotalVolume is the tonnage of a collection of sets.
func TotalVolume(sets models.SetSlice) Volume {
	var total Volume
	for _, set := range sets {
		total += Volume(set.Weight * float64(set.Reps))
	}

	return total
}
