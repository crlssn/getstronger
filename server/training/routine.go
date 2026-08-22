package training

import (
	"errors"
	"slices"

	"github.com/crlssn/getstronger/server/gen/models"
)

var (
	// ErrRoutineExerciseUnknown reports an exercise a routine cannot hold,
	// because it does not exist or belongs to another athlete.
	ErrRoutineExerciseUnknown = errors.New("routine exercise is unknown")
	// ErrRoutineExerciseOrderMismatch reports a reordering that names something
	// other than exactly the exercises the routine already holds.
	ErrRoutineExerciseOrderMismatch = errors.New("routine exercise order does not match the routine")
)

// ResolveRoutineExercises arranges available into the order requestedIDs asks
// for. Every requested exercise must be available: a routine cannot hold an
// exercise that does not exist, that belongs to somebody else, or that the
// request names twice.
func ResolveRoutineExercises(available models.ExerciseSlice, requestedIDs []string) (models.ExerciseSlice, error) {
	if len(available) != len(requestedIDs) {
		return nil, ErrRoutineExerciseUnknown
	}

	return OrderExercisesByIDs(available, requestedIDs), nil
}

// ValidateExerciseOrder checks that requestedIDs is a rearrangement of current:
// the same exercises, neither added to nor dropped.
func ValidateExerciseOrder(current models.ExerciseSlice, requestedIDs []string) error {
	if len(current) != len(requestedIDs) {
		return ErrRoutineExerciseOrderMismatch
	}

	held := make(map[string]struct{}, len(current))
	for _, exercise := range current {
		held[exercise.ID.String()] = struct{}{}
	}

	for _, exerciseID := range requestedIDs {
		if _, ok := held[exerciseID]; !ok {
			return ErrRoutineExerciseOrderMismatch
		}
	}

	return nil
}

// OrderExercisesByIDs returns the exercises rearranged to match the order of
// ids. IDs that match no exercise and duplicate IDs are skipped, as are
// exercises the ids omit.
func OrderExercisesByIDs(exercises models.ExerciseSlice, ids []string) models.ExerciseSlice {
	exercisesByID := make(map[string]*models.Exercise, len(exercises))
	for _, exercise := range exercises {
		exercisesByID[exercise.ID.String()] = exercise
	}

	ordered := make(models.ExerciseSlice, 0, len(exercises))
	for _, id := range ids {
		exercise, ok := exercisesByID[id]
		if !ok {
			continue
		}
		delete(exercisesByID, id)
		ordered = append(ordered, exercise)
	}

	return ordered
}

// NextRoutine is the routine to offer the athlete next. An active plan decides;
// without one the athlete's last choice stands, and a new athlete is offered
// whichever routine comes first.
func NextRoutine(activePlan *Plan, routines models.RoutineSlice, preferredRoutineID string) *models.Routine {
	if routine := activePlan.CurrentRoutine(); routine != nil {
		return routine
	}

	if preferredRoutineID != "" {
		index := slices.IndexFunc(routines, func(routine *models.Routine) bool {
			return routine.ID.String() == preferredRoutineID
		})
		if index >= 0 {
			return routines[index]
		}
	}

	if len(routines) > 0 {
		return routines[0]
	}

	return nil
}
