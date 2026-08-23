package training

import (
	"slices"

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
	Exercises                   []RoutineExercise
}

// RoutineExercise is one exercise where a routine trains it. The same exercise
// in another group, or in another routine, is a different occurrence and rests
// for its own length.
type RoutineExercise struct {
	Exercise *models.Exercise
	// RestSeconds is how long this occurrence rests between sets; zero turns
	// the timer off here alone.
	RestSeconds int32
}

// RoutineGroupDraft is a group as a save describes it. Exercises are named by
// ID because a save replaces a routine's groups wholesale rather than matching
// them up by group ID.
type RoutineGroupDraft struct {
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	Exercises                   []RoutineExerciseDraft
}

// RoutineExerciseDraft is one exercise a save puts in a group, and the rest it
// asks that occurrence to take. Nil is a save that does not say — one that
// named no groups at all — and leaves NewOccurrenceRestSeconds to answer.
type RoutineExerciseDraft struct {
	ExerciseID  string
	RestSeconds *int32
}

// NewOccurrenceRestSeconds is how long an exercise rests between sets where a
// routine has just started training it. An exercise measured against the clock
// — a plank, a run — is one continuous effort rather than a set to recover
// from, so it starts with no timer at all.
func NewOccurrenceRestSeconds(metrics []Metric) int32 {
	if slices.Contains(metrics, MetricTime) {
		return 0
	}

	return DefaultRestSeconds
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
		exercises := distinctOwned(group.Exercises, owned)
		if len(exercises) == 0 {
			continue
		}

		normalized = append(normalized, normalizeRoutineGroup(group, exercises))
	}

	if len(normalized) > 0 {
		return normalized
	}

	flat := make([]RoutineExerciseDraft, 0, len(ownedExerciseIDs))
	for _, id := range ownedExerciseIDs {
		flat = append(flat, RoutineExerciseDraft{ExerciseID: id})
	}

	fallback := distinctOwned(flat, owned)
	if len(fallback) == 0 {
		return normalized
	}

	return []RoutineGroupDraft{
		normalizeRoutineGroup(RoutineGroupDraft{Mode: RoutineGroupModeStraight}, fallback),
	}
}

// distinctOwned drops the exercises the routine's owner does not have, and the
// ones this group already holds. A repeat is only meaningful between groups, so
// a second copy inside one is dropped rather than trained.
func distinctOwned(exercises []RoutineExerciseDraft, owned map[string]struct{}) []RoutineExerciseDraft {
	kept := make([]RoutineExerciseDraft, 0, len(exercises))
	seen := make(map[string]struct{}, len(exercises))

	for _, exercise := range exercises {
		if _, ok := owned[exercise.ExerciseID]; !ok {
			continue
		}
		if _, duplicate := seen[exercise.ExerciseID]; duplicate {
			continue
		}
		seen[exercise.ExerciseID] = struct{}{}
		kept = append(kept, exercise)
	}

	return kept
}

func normalizeRoutineGroup(group RoutineGroupDraft, exercises []RoutineExerciseDraft) RoutineGroupDraft {
	normalized := RoutineGroupDraft{
		Mode:      group.Mode,
		Exercises: exercises,
	}
	if !normalized.Mode.Valid() {
		normalized.Mode = RoutineGroupModeStraight
	}

	for index, exercise := range normalized.Exercises {
		if exercise.RestSeconds == nil {
			continue
		}

		rest := clampInt32(*exercise.RestSeconds, 0, routineGroupMaxRestSeconds)
		normalized.Exercises[index].RestSeconds = &rest
	}

	// Every block pauses on the way to the next exercise, so both kinds carry
	// that rest. A circuit rests between the sets of nothing — it rotates
	// instead — but the set rest is kept rather than cleared, so a group
	// switched back to straight sets rests as it did before.
	normalized.RestBetweenExercisesSeconds = clampInt32(group.RestBetweenExercisesSeconds, 0, routineGroupMaxRestSeconds)

	// Only a circuit has a lap to close.
	if normalized.Mode == RoutineGroupModeCircuit {
		normalized.RestBetweenRoundsSeconds = clampInt32(group.RestBetweenRoundsSeconds, 0, routineGroupMaxRestSeconds)
	}

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
