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
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a", "b"}},
			},
		},
		{
			name: "exercises the routine does not hold are dropped",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a", "stranger"}},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
			},
		},
		{
			name: "the same exercise may be trained in two groups",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a", "b"}},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a", "b"}},
			},
		},
		{
			// A group is a block of distinct work: the same exercise twice in
			// one round is a repeat nobody asked for.
			name: "an exercise named twice in one group is held once",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a", "b", "a"}},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a", "b"}},
			},
		},
		{
			name:    "a flat list that repeats itself becomes one group of distinct work",
			ordered: []string{"a", "b", "a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a", "b"}},
			},
		},
		{
			name: "an emptied group is not saved",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{}},
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a"}},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"a"}},
			},
		},
		{
			// The groups are the routine: what they leave out is left out, which
			// is how an exercise is removed from one.
			name: "an exercise no group names is not in the routine",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"b"}},
			},
			ordered: []string{"a", "b", "dropped"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
				{Mode: training.RoutineGroupModeCircuit, ExerciseIDs: []string{"b"}},
			},
		},
		{
			name: "settings outside the supported range are pulled back into it",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: -5,
					RestBetweenRoundsSeconds:    99999,
					ExerciseIDs:                 []string{"a"},
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeCircuit,
					RestBetweenExercisesSeconds: 0,
					RestBetweenRoundsSeconds:    3600,
					ExerciseIDs:                 []string{"a"},
				},
			},
		},
		{
			name: "straight sets rest for as long as the exercise says",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 30,
					RestBetweenRoundsSeconds:    60,
					ExerciseIDs:                 []string{"a"},
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
			},
		},
		{
			name: "a group with no mode is straight sets",
			groups: []training.RoutineGroupDraft{
				{ExerciseIDs: []string{"a"}},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, ExerciseIDs: []string{"a"}},
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
