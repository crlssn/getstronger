package training_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/training"
)

// What a save means is decided in one place, so this is where the rules live:
// only the owner's exercises, no empty groups, repeats allowed across groups,
// and settings inside what the schema accepts.
func TestNormalizeRoutineGroups(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		// The groups as the request describes them, and the exercises the
		// routine's owner actually has.
		groups   []training.RoutineGroupDraft
		ordered  []string
		expected []training.RoutineGroupDraft
	}{
		{
			name:    "no groups becomes one straight group",
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a", "b")},
			},
		},
		{
			name: "exercises the routine does not hold are dropped",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a", "stranger")},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
			},
		},
		{
			name: "the same exercise may be trained in two groups",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a", "b")},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a", "b")},
			},
		},
		{
			// A group is a block of distinct work: the same exercise twice in
			// one round is a repeat nobody asked for.
			name: "an exercise named twice in one group is held once",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a", "b", "a")},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a", "b")},
			},
		},
		{
			name:    "a flat list that repeats itself becomes one group of distinct work",
			ordered: []string{"a", "b", "a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a", "b")},
			},
		},
		{
			name: "an emptied group is not saved",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: []training.RoutineExerciseDraft{}},
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a")},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("a")},
			},
		},
		{
			// The groups are the routine: what they leave out is left out, which
			// is how an exercise is removed from one.
			name: "an exercise no group names is not in the routine",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("b")},
			},
			ordered: []string{"a", "b", "dropped"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Exercises: exercises("b")},
			},
		},
		{
			name: "settings outside the supported range are pulled back into it",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: -5,
					RestBetweenRoundsSeconds:    99999,
					Exercises:                   exercises("a"),
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: 0,
					RestBetweenRoundsSeconds:    3600,
					Exercises:                   exercises("a"),
				},
			},
		},
		{
			name: "both group rests belong to a circuit",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 30,
					RestBetweenRoundsSeconds:    60,
					Exercises:                   exercises("a"),
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
			},
		},
		{
			// The point of the whole thing: the same lift rests one length here
			// and another length in the routine next door.
			name: "a straight group keeps the rest each of its exercises was given",
			groups: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: "a", RestSeconds: new(int32(180))},
						{ExerciseID: "b"},
						{ExerciseID: "c", RestSeconds: new(int32(0))},
					},
				},
			},
			ordered: []string{"a", "b", "c"},
			expected: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						// Set, so the routine says how long to rest.
						{ExerciseID: "a", RestSeconds: new(int32(180))},
						// Unset, so the rest a new occurrence starts at answers.
						{ExerciseID: "b"},
						// Zero is an answer of its own: no timer here.
						{ExerciseID: "c", RestSeconds: new(int32(0))},
					},
				},
			},
		},
		{
			name: "a per-exercise rest outside the supported range is pulled back into it",
			groups: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: "a", RestSeconds: new(int32(-5))},
						{ExerciseID: "b", RestSeconds: new(int32(99999))},
					},
				},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: "a", RestSeconds: new(int32(0))},
						{ExerciseID: "b", RestSeconds: new(int32(3600))},
					},
				},
			},
		},
		{
			// A circuit rests on the way to the next exercise and on the way
			// into the next round, so a set rest has nowhere to go while it is
			// one. It is kept rather than cleared, so a group switched back to
			// straight sets rests as it did before.
			name: "a circuit keeps a set rest it has nowhere to take",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                     training.RoutineGroupModeCircuit,
					RestBetweenRoundsSeconds: 120,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: "a", RestSeconds: new(int32(180))},
					},
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{
					Mode:                     training.RoutineGroupModeCircuit,
					RestBetweenRoundsSeconds: 120,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: "a", RestSeconds: new(int32(180))},
					},
				},
			},
		},
		{
			name: "a group with no mode is straight sets",
			groups: []training.RoutineGroupDraft{
				{Exercises: exercises("a")},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
			},
		},
		{
			name:     "a routine with no exercises has no groups",
			ordered:  nil,
			expected: []training.RoutineGroupDraft{},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, training.NormalizeRoutineGroups(test.groups, test.ordered))
		})
	}
}

// exercises names a group's exercises, none of them saying anything about rest
// — which is every routine written before a routine could.
func exercises(ids ...string) []training.RoutineExerciseDraft {
	drafts := make([]training.RoutineExerciseDraft, 0, len(ids))
	for _, id := range ids {
		drafts = append(drafts, training.RoutineExerciseDraft{ExerciseID: id})
	}

	return drafts
}
