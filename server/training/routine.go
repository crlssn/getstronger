package training

import (
	"errors"
	"slices"

	"github.com/gofrs/uuid/v5"

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
func ResolveRoutineExercises(available models.ExerciseSlice, requestedIDs []uuid.UUID) (models.ExerciseSlice, error) {
	if len(available) != len(requestedIDs) {
		return nil, ErrRoutineExerciseUnknown
	}

	return OrderExercisesByIDs(available, requestedIDs), nil
}

// ValidateExerciseOrder checks that requestedIDs is a rearrangement of current:
// the same exercises, neither added to nor dropped.
func ValidateExerciseOrder(current models.ExerciseSlice, requestedIDs []uuid.UUID) error {
	if len(current) != len(requestedIDs) {
		return ErrRoutineExerciseOrderMismatch
	}

	held := make(map[uuid.UUID]struct{}, len(current))
	for _, exercise := range current {
		held[exercise.ID] = struct{}{}
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
func OrderExercisesByIDs(exercises models.ExerciseSlice, ids []uuid.UUID) models.ExerciseSlice {
	return orderByIDs(exercises, ids, func(exercise *models.Exercise) uuid.UUID {
		return exercise.ID
	})
}

// OrderRoutinesByIDs returns the routines rearranged to match the order of ids,
// which is how a plan's rotation is put back together once the routines it
// names have been read in one go. It skips on the same terms as
// OrderExercisesByIDs, so a caller that needs every id matched compares lengths.
func OrderRoutinesByIDs(routines models.RoutineSlice, ids []uuid.UUID) models.RoutineSlice {
	return orderByIDs(routines, ids, func(routine *models.Routine) uuid.UUID {
		return routine.ID
	})
}

// orderByIDs rearranges items into the order ids asks for, reading each item's
// identifier with id. Unknown and repeated ids are skipped, as are items no id
// names.
func orderByIDs[T any](items []T, ids []uuid.UUID, id func(T) uuid.UUID) []T {
	byID := make(map[uuid.UUID]T, len(items))
	for _, item := range items {
		byID[id(item)] = item
	}

	ordered := make([]T, 0, len(items))
	for _, wanted := range ids {
		item, ok := byID[wanted]
		if !ok {
			continue
		}
		delete(byID, wanted)
		ordered = append(ordered, item)
	}

	return ordered
}

// NextRoutine is the routine to offer the athlete next. An active plan decides;
// without one the athlete's last choice stands, and a new athlete is offered
// whichever routine comes first.
func NextRoutine(activePlan *Plan, routines models.RoutineSlice, preferredRoutineID uuid.UUID) *models.Routine {
	if routine := activePlan.CurrentRoutine(); routine != nil {
		return routine
	}

	if !preferredRoutineID.IsNil() {
		index := slices.IndexFunc(routines, func(routine *models.Routine) bool {
			return routine.ID == preferredRoutineID
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
