package training_test

import (
	"testing"

	"github.com/gofrs/uuid/v5"

	"github.com/crlssn/getstronger/server/training"
)

func TestRoutinePreservesTargetDuration(t *testing.T) {
	id := exerciseID("walk")
	groups := training.NormalizeRoutineGroups([]training.RoutineGroupDraft{{
		Mode: training.RoutineGroupModeCircuit, Rounds: 6,
		Exercises: []training.RoutineExerciseDraft{{ExerciseID: id, TargetDurationSeconds: 120}},
	}}, []uuid.UUID{id})
	if got := groups[0].Exercises[0].TargetDurationSeconds; got != 120 {
		t.Fatalf("duration = %d, want 120", got)
	}
}
