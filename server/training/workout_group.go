package training

// WorkoutGroupDraft is one block of a finished workout as a save describes it.
//
// It carries no sets: the sets travel with the workout, and a block states how
// many of each exercise's the block took. NormalizeWorkoutGroups turns that
// into the slice of each exercise's sets that belongs to it.
type WorkoutGroupDraft struct {
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	// Rounds is the prescription the block was trained against; how many rounds
	// were actually worked is read off the sets.
	Rounds    int32
	Exercises []WorkoutGroupExerciseDraft
}

// WorkoutGroupExerciseDraft is one exercise where a block trained it, and how
// many of that exercise's sets the block took.
type WorkoutGroupExerciseDraft struct {
	ExerciseID string
	SetCount   int
}

// WorkoutGroupExerciseSets is one exercise where a block trained it, resolved
// to the positions of the sets it took. Positions index the exercise's sets in
// the order the workout recorded them.
type WorkoutGroupExerciseSets struct {
	ExerciseID   string
	SetPositions []int
}

// WorkoutGroup is one block of a finished workout, resolved against the sets
// the workout holds.
type WorkoutGroup struct {
	Mode                        RoutineGroupMode
	RestBetweenExercisesSeconds int32
	RestBetweenRoundsSeconds    int32
	Rounds                      int32
	Exercises                   []WorkoutGroupExerciseSets
}

// NormalizeWorkoutGroups resolves a save's blocks against the sets it logged.
//
// Each block takes the next SetCount of its exercise's sets, so an exercise
// trained in two blocks splits between them in the order the blocks are listed.
// A block asking for more than is left takes what is left; one that ends up
// holding nothing is dropped, because a block with no work in it is not part of
// the session that happened. A save naming no blocks stores none, which is how
// every workout logged before blocks were recorded reads.
func NormalizeWorkoutGroups(groups []WorkoutGroupDraft, setCounts map[string]int) []WorkoutGroup {
	taken := make(map[string]int, len(setCounts))

	normalized := make([]WorkoutGroup, 0, len(groups))
	for _, group := range groups {
		exercises := make([]WorkoutGroupExerciseSets, 0, len(group.Exercises))
		for _, exercise := range group.Exercises {
			positions := takePositions(exercise, setCounts, taken)
			if len(positions) == 0 {
				continue
			}

			exercises = append(exercises, WorkoutGroupExerciseSets{
				ExerciseID:   exercise.ExerciseID,
				SetPositions: positions,
			})
		}

		if len(exercises) == 0 {
			continue
		}

		normalized = append(normalized, normalizeWorkoutGroup(group, exercises))
	}

	return normalized
}

func takePositions(
	exercise WorkoutGroupExerciseDraft, setCounts map[string]int, taken map[string]int,
) []int {
	logged, ok := setCounts[exercise.ExerciseID]
	if !ok {
		return nil
	}

	from := taken[exercise.ExerciseID]
	to := from + exercise.SetCount
	if exercise.SetCount < 0 || to > logged {
		to = logged
	}
	if to <= from {
		return nil
	}
	taken[exercise.ExerciseID] = to

	positions := make([]int, 0, to-from)
	for position := from; position < to; position++ {
		positions = append(positions, position)
	}

	return positions
}

func normalizeWorkoutGroup(group WorkoutGroupDraft, exercises []WorkoutGroupExerciseSets) WorkoutGroup {
	normalized := WorkoutGroup{
		Mode:      group.Mode,
		Exercises: exercises,
	}
	if !normalized.Mode.Valid() {
		normalized.Mode = RoutineGroupModeStraight
	}

	normalized.RestBetweenExercisesSeconds = clampInt32(group.RestBetweenExercisesSeconds, routineGroupMaxRestSeconds)

	// Only a circuit has a lap to close, or a number of them to run.
	if normalized.Mode == RoutineGroupModeCircuit {
		normalized.RestBetweenRoundsSeconds = clampInt32(group.RestBetweenRoundsSeconds, routineGroupMaxRestSeconds)
		normalized.Rounds = clampInt32(group.Rounds, routineGroupMaxRounds)
	}

	return normalized
}
