package training

import (
	"slices"
	"strings"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/gen/models/enums"
)

// RoutineGroupMode says how a group's exercises are worked through. Straight
// sets finish one exercise before the next begins; a circuit takes one set of
// each in turn and repeats until the session says it is done.
type RoutineGroupMode = enums.RoutineGroupMode

// RoutineGroupRole says where a block sits in an interval routine: a warm-up
// worked once before the round count, the block that count repeats, a cool-down
// worked once after it. The zero value is a block with no such place — every
// gym circuit, and every routine saved before intervals existed.
type RoutineGroupRole = enums.RoutineGroupRole

// RoutineExerciseTracking says how the work of one occurrence is counted: in
// sets recovered between, against a clock that ends it, or by a distance
// covered however long it takes. The zero value is an occurrence saved before a
// routine said, which reads as timed where it carries a target duration and as
// sets everywhere else.
type RoutineExerciseTracking = enums.RoutineExerciseTracking

const (
	RoutineGroupModeStraight = enums.RoutineGroupModeStraight
	RoutineGroupModeCircuit  = enums.RoutineGroupModeCircuit

	RoutineGroupRoleWarmup   = enums.RoutineGroupRoleWarmup
	RoutineGroupRoleRepeat   = enums.RoutineGroupRoleRepeat
	RoutineGroupRoleCooldown = enums.RoutineGroupRoleCooldown

	RoutineExerciseTrackingSets     = enums.RoutineExerciseTrackingSets
	RoutineExerciseTrackingTimed    = enums.RoutineExerciseTrackingTimed
	RoutineExerciseTrackingDistance = enums.RoutineExerciseTrackingDistance

	// A rest longer than an hour is a different session, not a longer rest.
	routineGroupMaxRestSeconds = 3600

	// A hundred rounds is a different sport.
	routineGroupMaxRounds = 99

	// A guided interval is held for at most a day, which is the recording's
	// own ceiling.
	routineGroupMaxTargetDurationSeconds = 86400

	// Twenty sets of one exercise is a session, not a block of one.
	routineGroupMaxSets = 20

	// Fifty kilometres in one prescribed effort is an ultra, and further than
	// a routine plans for.
	routineGroupMaxDistanceMeters = 50000

	// A title longer than this is a note, and the column takes sixty.
	routineGroupMaxTitleRunes = 60
)

// RoutineGroup is one block of a routine: the exercises it holds, in training
// order, and how they are worked through.
type RoutineGroup struct {
	ID                          uuid.UUID
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	// Rounds is how many times a circuit is prescribed to go round; zero runs
	// it for as many rounds as the session takes. It is a target rather than a
	// limit: the session may take another round or stop short of it.
	Rounds int32
	// Role is where this block sits in an interval routine, or nothing at all
	// where the routine is not one.
	Role RoutineGroupRole
	// SkipLastOnFinalRound drops the repeating block's last exercise on its
	// final round, so a walk-run does not end the session with a walk. Only the
	// repeating block has it.
	SkipLastOnFinalRound bool
	// Title is what the athlete named this block, or nothing at all where they
	// left it to read by its position.
	Title     string
	Exercises []RoutineExercise
}

// RoutineExercise is one exercise where a routine trains it. The same exercise
// in another group, or in another routine, is a different occurrence and rests
// for its own length.
type RoutineExercise struct {
	Exercise *Exercise
	// RestSeconds is how long this occurrence rests between sets; zero turns
	// the timer off here alone.
	RestSeconds int32
	// TargetDurationSeconds is how long a circuit round holds this occurrence
	// when the session is guided against the clock; zero logs it by hand.
	TargetDurationSeconds int32
	// Tracking says which of the three prescriptions below to read.
	Tracking RoutineExerciseTracking
	// Sets is how many sets this occurrence prescribes; zero is a routine that
	// does not say. Read only where the occurrence is tracked in sets.
	Sets int32
	// TargetDistanceMeters is the distance this occurrence covers, however long
	// it takes. Read only where the occurrence is tracked by distance.
	TargetDistanceMeters int32
}

// RoutineGroupDraft is a group as a save describes it. Exercises are named by
// ID because a save replaces a routine's groups wholesale rather than matching
// them up by group ID.
type RoutineGroupDraft struct {
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	Rounds                      int32
	Role                        RoutineGroupRole
	SkipLastOnFinalRound        bool
	Title                       string
	Exercises                   []RoutineExerciseDraft
}

// RoutineExerciseDraft is one exercise a save puts in a group, and the rest it
// asks that occurrence to take. Nil is a save that does not say — one that
// named no groups at all — and leaves NewOccurrenceRestSeconds to answer.
type RoutineExerciseDraft struct {
	ExerciseID            uuid.UUID
	RestSeconds           *int32
	TargetDurationSeconds int32
	Tracking              RoutineExerciseTracking
	Sets                  int32
	TargetDistanceMeters  int32
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
func NormalizeRoutineGroups(groups []RoutineGroupDraft, ownedExerciseIDs []uuid.UUID) []RoutineGroupDraft {
	owned := make(map[uuid.UUID]struct{}, len(ownedExerciseIDs))
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
func distinctOwned(exercises []RoutineExerciseDraft, owned map[uuid.UUID]struct{}) []RoutineExerciseDraft {
	kept := make([]RoutineExerciseDraft, 0, len(exercises))
	seen := make(map[uuid.UUID]struct{}, len(exercises))

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
		Role:      group.Role,
		Title:     routineGroupTitle(group.Title),
		Exercises: exercises,
	}
	if !normalized.Mode.Valid() {
		normalized.Mode = RoutineGroupModeStraight
	}

	// A role names one of the three parts of an interval routine. Anything else
	// is a block that has no such place, which is every gym circuit.
	if !normalized.Role.Valid() {
		normalized.Role = ""
	}

	// Only a block worked round after round has a final round to end early. A
	// straight block is worked once through, so it has none.
	normalized.SkipLastOnFinalRound = group.SkipLastOnFinalRound && normalized.Mode == RoutineGroupModeCircuit

	for index, exercise := range normalized.Exercises {
		normalized.Exercises[index] = normalizeRoutineExercise(exercise)
	}

	// Every block pauses on the way to the next exercise, so both kinds carry
	// that rest. A circuit rests between the sets of nothing — it rotates
	// instead — but the set rest is kept rather than cleared, so a group
	// switched back to straight sets rests as it did before.
	normalized.RestBetweenExercisesSeconds = clampInt32(group.RestBetweenExercisesSeconds, routineGroupMaxRestSeconds)

	// Only a circuit has a lap to close, or a number of them to run.
	if normalized.Mode == RoutineGroupModeCircuit {
		normalized.RestBetweenRoundsSeconds = clampInt32(group.RestBetweenRoundsSeconds, routineGroupMaxRestSeconds)
		normalized.Rounds = clampInt32(group.Rounds, routineGroupMaxRounds)
	}

	return normalized
}

// normalizeRoutineExercise is what one occurrence is worth saving as: the
// prescription it is tracked by, and nothing else.
//
// The two it is not tracked by are cleared rather than carried. A run measured
// by the distance it covers that also held a leftover thirty seconds would be
// guided as a thirty-second run by every reader that trusts the field, and the
// row is what every reader has.
func normalizeRoutineExercise(exercise RoutineExerciseDraft) RoutineExerciseDraft {
	normalized := RoutineExerciseDraft{
		ExerciseID: exercise.ExerciseID,
		Tracking:   occurrenceTracking(exercise),
	}

	switch normalized.Tracking {
	case RoutineExerciseTrackingTimed:
		normalized.TargetDurationSeconds = clampInt32(exercise.TargetDurationSeconds, routineGroupMaxTargetDurationSeconds)
	case RoutineExerciseTrackingDistance:
		normalized.TargetDistanceMeters = clampInt32(exercise.TargetDistanceMeters, routineGroupMaxDistanceMeters)
	default:
		normalized.Sets = clampInt32(exercise.Sets, routineGroupMaxSets)
		if exercise.RestSeconds != nil {
			rest := clampInt32(*exercise.RestSeconds, routineGroupMaxRestSeconds)
			normalized.RestSeconds = &rest
		}
	}

	return normalized
}

// routineGroupTitle is the name a block stores. Surrounding space is not part
// of a name, and the column takes sixty characters — counted in runes, so a
// name is not cut where the athlete did not write a cut.
func routineGroupTitle(title string) string {
	trimmed := strings.TrimSpace(title)
	runes := []rune(trimmed)
	if len(runes) <= routineGroupMaxTitleRunes {
		return trimmed
	}

	return strings.TrimSpace(string(runes[:routineGroupMaxTitleRunes]))
}

// occurrenceTracking is how an occurrence's work is counted. A save that does
// not say — an older client, or one that named no groups at all — is read the
// way every routine was read before a routine could say: held against the clock
// where it prescribes a duration, counted in sets everywhere else.
func occurrenceTracking(exercise RoutineExerciseDraft) RoutineExerciseTracking {
	if exercise.Tracking.Valid() {
		return exercise.Tracking
	}
	if exercise.TargetDurationSeconds > 0 {
		return RoutineExerciseTrackingTimed
	}

	return RoutineExerciseTrackingSets
}

// clampInt32 pulls a group setting into the range the schema takes. Every one
// of them floors at zero — no rest, no rounds — so only the ceiling varies.
func clampInt32(value, maximum int32) int32 {
	if value < 0 {
		return 0
	}
	if value > maximum {
		return maximum
	}

	return value
}
