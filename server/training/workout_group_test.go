package training_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/training"
)

// A workout's blocks are resolved against the sets it logged, so this is where
// "which sets belong to which block" is decided.
func TestNormalizeWorkoutGroups(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		groups    []training.WorkoutGroupDraft
		setCounts map[string]int
		expected  []training.WorkoutGroup
	}{
		{
			name:      "a save naming no blocks stores none",
			setCounts: map[string]int{"a": 3},
			expected:  []training.WorkoutGroup{},
		},
		{
			name: "a block takes the sets it says it took",
			groups: []training.WorkoutGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: took("a", 3)},
			},
			setCounts: map[string]int{"a": 3},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0, 1, 2)},
			},
		},
		{
			// The point of the whole thing: a bench press in the warm-up and a
			// bench press in the circuit are two pieces of work, and the sets
			// split between them in the order the blocks are listed.
			name: "an exercise trained in two blocks splits between them",
			groups: []training.WorkoutGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: took("a", 2)},
				{Mode: training.RoutineGroupModeCircuit, Exercises: took("a", 3)},
			},
			setCounts: map[string]int{"a": 5},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0, 1)},
				{Mode: training.RoutineGroupModeCircuit, Exercises: positions(2, 3, 4)},
			},
		},
		{
			// The sets are the record; a block's count is a claim about them.
			name: "a block asking for more sets than were logged takes what is left",
			groups: []training.WorkoutGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: took("a", 9)},
			},
			setCounts: map[string]int{"a": 2},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0, 1)},
			},
		},
		{
			name: "an exercise the workout did not log is not in a block",
			groups: []training.WorkoutGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: took("a", 1, "stranger", 1)},
			},
			setCounts: map[string]int{"a": 1},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0)},
			},
		},
		{
			// Nothing was worked there, so it was not part of the session.
			name: "a block left holding nothing is not stored",
			groups: []training.WorkoutGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: took("a", 2)},
				{Mode: training.RoutineGroupModeCircuit, Exercises: took("a", 2)},
			},
			setCounts: map[string]int{"a": 2},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0, 1)},
			},
		},
		{
			name: "a straight block drops the settings it has no use for",
			groups: []training.WorkoutGroupDraft{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 30,
					RestBetweenRoundsSeconds:    60,
					Rounds:                      3,
					Exercises:                   took("a", 1),
				},
			},
			setCounts: map[string]int{"a": 1},
			expected: []training.WorkoutGroup{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 30,
					Exercises:                   positions(0),
				},
			},
		},
		{
			name: "settings outside the supported range are pulled back into it",
			groups: []training.WorkoutGroupDraft{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: -5,
					RestBetweenRoundsSeconds:    99999,
					Rounds:                      999,
					Exercises:                   took("a", 1),
				},
			},
			setCounts: map[string]int{"a": 1},
			expected: []training.WorkoutGroup{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: 0,
					RestBetweenRoundsSeconds:    3600,
					Rounds:                      99,
					Exercises:                   positions(0),
				},
			},
		},
		{
			name: "a block with no mode is straight sets",
			groups: []training.WorkoutGroupDraft{
				{Exercises: took("a", 1)},
			},
			setCounts: map[string]int{"a": 1},
			expected: []training.WorkoutGroup{
				{Mode: training.RoutineGroupModeStraight, Exercises: positions(0)},
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, training.NormalizeWorkoutGroups(test.groups, test.setCounts))
		})
	}
}

// took names a block's exercises as pairs of ID and how many sets it took.
func took(pairs ...any) []training.WorkoutGroupExerciseDraft {
	drafts := make([]training.WorkoutGroupExerciseDraft, 0, len(pairs)/2)
	for index := 0; index+1 < len(pairs); index += 2 {
		id, _ := pairs[index].(string)
		count, _ := pairs[index+1].(int)
		drafts = append(drafts, training.WorkoutGroupExerciseDraft{ExerciseID: id, SetCount: count})
	}

	return drafts
}

// positions states what a block ends up holding. Every case here trains the one
// exercise the workout logged, so only the set positions vary.
func positions(taken ...int) []training.WorkoutGroupExerciseSets {
	return []training.WorkoutGroupExerciseSets{
		{ExerciseID: "a", SetPositions: taken},
	}
}
