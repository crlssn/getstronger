package training

import (
	"errors"
	"time"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/weightunit"
)

// QuickWorkoutName names a workout logged without following a routine.
const QuickWorkoutName = "Quick Workout"

// ErrWorkoutStartsAfterFinish reports a workout whose clock runs backwards.
var ErrWorkoutStartsAfterFinish = errors.New("workout must start before it finishes")

// ErrWorkoutAlreadySaved reports a save the user already made: the same
// idempotency key was sent again, as a replayed or retried request is.
var ErrWorkoutAlreadySaved = errors.New("workout is already saved")

// ErrWorkoutExerciseUnknown reports an exercise a workout cannot log sets
// against, because it does not exist or belongs to another athlete.
var ErrWorkoutExerciseUnknown = errors.New("workout exercise is unknown")

// ValidateWorkoutExercises checks that a save logs its sets only against
// exercises the athlete owns. owned is the athlete's own exercises among those
// requested, so a requested id missing from it is somebody else's.
//
// Unlike a routine's exercises, the same one may be requested twice: a workout
// trains an exercise in as many blocks as it likes.
func ValidateWorkoutExercises(owned []*Exercise, requestedIDs []uuid.UUID) error {
	ownedIDs := make(map[uuid.UUID]struct{}, len(owned))
	for _, exercise := range owned {
		ownedIDs[exercise.ID] = struct{}{}
	}

	for _, requestedID := range requestedIDs {
		if _, ok := ownedIDs[requestedID]; !ok {
			return ErrWorkoutExerciseUnknown
		}
	}

	return nil
}

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
func TotalVolume(sets []*Set) Volume {
	var total Volume
	for _, set := range sets {
		total += Volume(set.Weight * float64(set.Reps))
	}

	return total
}

// Distance is ground covered, in kilometres — the unit every set is stored in,
// whatever unit it was entered in.
type Distance float64

// Float64 renders the distance for callers that report it numerically.
func (d Distance) Float64() float64 {
	return float64(d)
}

// TotalDistance is the ground a collection of sets covered.
func TotalDistance(sets []*Set) Distance {
	var total Distance
	for _, set := range sets {
		total += Distance(set.Distance)
	}

	return total
}

// Workout is a session an athlete has logged. The relations are filled in
// only when the read asked for them, so a nil slice means "not loaded" rather
// than "none".
type Workout struct {
	ID     uuid.UUID
	UserID uuid.UUID
	// RoutineID names the routine the session followed, or is nil for a
	// session logged without one.
	RoutineID  uuid.UUID
	Name       string
	Note       string
	StartedAt  time.Time
	FinishedAt time.Time
	CreatedAt  time.Time

	User     *account.User
	Comments []*WorkoutComment
	Sets     []*Set
}

// Set is one set of one exercise within a workout. Weight is stored in
// kilograms and distance in kilometres whatever unit the athlete entered; the
// unit says how to show it back.
type Set struct {
	ID              uuid.UUID
	WorkoutID       uuid.UUID
	ExerciseID      uuid.UUID
	UserID          uuid.UUID
	Weight          float64
	Reps            int32
	Distance        float64
	DurationSeconds int32
	WeightUnit      weightunit.Unit
	DistanceUnit    distanceunit.Unit
	// Position is where the set came in the order the session logged them,
	// which is what a circuit's rounds are read off.
	Position int32
	// OccurrenceID names the block occurrence that logged the set, or is nil
	// for a set stored ungrouped.
	OccurrenceID uuid.UUID
	CreatedAt    time.Time

	// Exercise is the exercise the set is of, when the read loaded it.
	Exercise *Exercise
}

// WorkoutComment is something somebody said about a workout.
type WorkoutComment struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	WorkoutID uuid.UUID
	Comment   string
	CreatedAt time.Time

	// User is who said it and Workout what they said it about, each when the
	// read loaded it.
	User    *account.User
	Workout *Workout
}
