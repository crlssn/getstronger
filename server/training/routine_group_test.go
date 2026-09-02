package training_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/training"
)

// normalizeCase is one save, and what it is worth saving as. The groups are as
// the request describes them; ordered is the exercises the routine's owner has.
type normalizeCase struct {
	name     string
	groups   []training.RoutineGroupDraft
	ordered  []string
	expected []training.RoutineGroupDraft
}

func runNormalizeCases(t *testing.T, tests []normalizeCase) {
	t.Helper()

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, training.NormalizeRoutineGroups(test.groups, exerciseIDs(test.ordered...)))
		})
	}
}

// Which exercises a save puts where: only the owner's, no empty groups, and
// repeats allowed between groups but not inside one.
func TestNormalizeRoutineGroupMembership(t *testing.T) {
	t.Parallel()

	runNormalizeCases(t, []normalizeCase{
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
			name:     "a routine with no exercises has no groups",
			ordered:  nil,
			expected: []training.RoutineGroupDraft{},
		},
	})
}

// What a save's settings are worth storing as: the mode decides which of them
// the block has at all, and each is pulled into the range the schema takes.
func TestNormalizeRoutineGroupSettings(t *testing.T) {
	t.Parallel()

	runNormalizeCases(t, []normalizeCase{
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
			// A straight block pauses between exercises like a circuit does, but
			// is worked once through, so it has no round to close.
			name: "a straight group keeps its rest between exercises and drops the round",
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
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 30,
					Exercises:                   exercises("a"),
				},
			},
		},
		{
			name: "a rest between exercises outside the supported range is pulled back into it",
			groups: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 99999,
					Exercises:                   exercises("a"),
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{
					Mode:                        training.RoutineGroupModeStraight,
					RestBetweenExercisesSeconds: 3600,
					Exercises:                   exercises("a"),
				},
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
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(180))},
						{ExerciseID: exerciseID("b")},
						{ExerciseID: exerciseID("c"), RestSeconds: new(int32(0))},
					},
				},
			},
			ordered: []string{"a", "b", "c"},
			expected: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						// Set, so the routine says how long to rest.
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(180))},
						// Unset, so the rest a new occurrence starts at answers.
						{ExerciseID: exerciseID("b")},
						// Zero is an answer of its own: no timer here.
						{ExerciseID: exerciseID("c"), RestSeconds: new(int32(0))},
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
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(-5))},
						{ExerciseID: exerciseID("b"), RestSeconds: new(int32(99999))},
					},
				},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{
					Mode: training.RoutineGroupModeStraight,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(0))},
						{ExerciseID: exerciseID("b"), RestSeconds: new(int32(3600))},
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
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(180))},
					},
				},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{
					Mode:                     training.RoutineGroupModeCircuit,
					RestBetweenRoundsSeconds: 120,
					Exercises: []training.RoutineExerciseDraft{
						{ExerciseID: exerciseID("a"), RestSeconds: new(int32(180))},
					},
				},
			},
		},
		{
			// A circuit is prescribed for a number of rounds, and a straight
			// block has no round to run.
			name: "a straight group drops the rounds it was given",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Rounds: 3, Exercises: exercises("a")},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeStraight, Exercises: exercises("a")},
			},
		},
		{
			name: "a circuit keeps the rounds it is prescribed for",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Rounds: 3, Exercises: exercises("a")},
			},
			ordered: []string{"a"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Rounds: 3, Exercises: exercises("a")},
			},
		},
		{
			// Zero is an answer of its own: the circuit runs for as many rounds
			// as the session takes, which is what every circuit did before one
			// could be prescribed.
			name: "a round count outside the supported range is pulled back into it",
			groups: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Rounds: -1, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Rounds: 999, Exercises: exercises("b")},
			},
			ordered: []string{"a", "b"},
			expected: []training.RoutineGroupDraft{
				{Mode: training.RoutineGroupModeCircuit, Rounds: 0, Exercises: exercises("a")},
				{Mode: training.RoutineGroupModeCircuit, Rounds: 99, Exercises: exercises("b")},
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
	})
}

// exercises names a group's exercises, none of them saying anything about rest
// — which is every routine written before a routine could.
func exercises(names ...string) []training.RoutineExerciseDraft {
	drafts := make([]training.RoutineExerciseDraft, 0, len(names))
	for _, name := range names {
		drafts = append(drafts, training.RoutineExerciseDraft{ExerciseID: exerciseID(name)})
	}

	return drafts
}

// exerciseID is the row id a test's name stands for. Names read better than
// ids in a table of cases, and the same name always means the same row.
func exerciseID(name string) uuid.UUID {
	return uuid.NewV5(uuid.NamespaceOID, name)
}

func exerciseIDs(names ...string) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(names))
	for _, name := range names {
		ids = append(ids, exerciseID(name))
	}

	return ids
}
