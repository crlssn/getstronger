package training

import (
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// RoutineGroupMode says how a group's exercises are worked through. Straight
// sets finish one exercise before the next begins; a circuit takes one set of
// each in turn and repeats until the session says it is done.
type RoutineGroupMode = enums.RoutineGroupMode

const (
	RoutineGroupModeStraight = enums.RoutineGroupModeStraight
	RoutineGroupModeCircuit  = enums.RoutineGroupModeCircuit

	// A rest longer than an hour is a different session, not a longer rest.
	routineGroupMaxRestSeconds = 3600
)

// RoutineGroup is one block of a routine: the exercises it holds, in training
// order, and how they are worked through.
type RoutineGroup struct {
	ID                          string
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	Exercises                   models.ExerciseSlice
}

// RoutineGroupDraft is a group as a save describes it. Exercises are named by
// ID because a save replaces a routine's groups wholesale rather than matching
// them up by group ID.
type RoutineGroupDraft struct {
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	ExerciseIDs                 []string
}

// NormalizeRoutineGroups is what a routine's groups are worth saving as.
//
// Exercises the athlete does not have are dropped, as are groups left holding
// nothing. The same exercise may be trained in more than one group — a bench
// press in the warm-up and a bench press in the circuit are two different
// pieces of work — but only once inside any one of them. A save that names no
// groups at all becomes one straight-sets group holding everything it named.
func NormalizeRoutineGroups(groups []RoutineGroupDraft, ownedExerciseIDs []string) []RoutineGroupDraft {
	owned := make(map[string]struct{}, len(ownedExerciseIDs))
	for _, id := range ownedExerciseIDs {
		owned[id] = struct{}{}
	}

	normalized := make([]RoutineGroupDraft, 0, len(groups))
	for _, group := range groups {
		exerciseIDs := distinctOwned(group.ExerciseIDs, owned)
		if len(exerciseIDs) == 0 {
			continue
		}

		normalized = append(normalized, normalizeRoutineGroup(group, exerciseIDs))
	}

	if len(normalized) > 0 {
		return normalized
	}

	fallback := distinctOwned(ownedExerciseIDs, owned)
	if len(fallback) == 0 {
		return normalized
	}

	return []RoutineGroupDraft{
		normalizeRoutineGroup(RoutineGroupDraft{Mode: RoutineGroupModeStraight}, fallback),
	}
}

// distinctOwned drops the IDs that name an exercise the routine's owner does
// not have, and the ones this group already holds. A repeat is only meaningful
// between groups, so a second copy inside one is dropped rather than trained.
func distinctOwned(exerciseIDs []string, owned map[string]struct{}) []string {
	kept := make([]string, 0, len(exerciseIDs))
	seen := make(map[string]struct{}, len(exerciseIDs))

	for _, id := range exerciseIDs {
		if _, ok := owned[id]; !ok {
			continue
		}
		if _, duplicate := seen[id]; duplicate {
			continue
		}
		seen[id] = struct{}{}
		kept = append(kept, id)
	}

	return kept
}

func normalizeRoutineGroup(group RoutineGroupDraft, exerciseIDs []string) RoutineGroupDraft {
	normalized := RoutineGroupDraft{
		Mode:        group.Mode,
		ExerciseIDs: exerciseIDs,
	}
	if !normalized.Mode.Valid() {
		normalized.Mode = RoutineGroupModeStraight
	}

	// Both rests belong to a circuit: straight sets rest for as long as the
	// exercise itself says.
	if normalized.Mode != RoutineGroupModeCircuit {
		return normalized
	}

	normalized.RestBetweenExercisesSeconds = clampInt32(group.RestBetweenExercisesSeconds, 0, routineGroupMaxRestSeconds)
	normalized.RestBetweenRoundsSeconds = clampInt32(group.RestBetweenRoundsSeconds, 0, routineGroupMaxRestSeconds)

	return normalized
}

func clampInt32(value, minimum, maximum int32) int32 {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}

	return value
}
