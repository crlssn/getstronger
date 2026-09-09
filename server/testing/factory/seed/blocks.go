package main

import (
	"context"
	"fmt"
	"time"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// The gym session the active persona trains in blocks: three straight sets of
// squats, then a circuit of push-ups and lunges worked three times through. It
// is the shape migration 049 gave a finished workout, and the one a seeded
// workout has to carry for a circuit to read back as a circuit.
const (
	blockedWorkoutName          = "Full Body Circuit"
	blockedWorkoutFinished      = 5 * time.Hour
	blockedWorkoutLength        = 45 * time.Minute
	blockedStraightSets         = 3
	blockedCircuitRounds        = 3
	blockedRestBetweenExercises = 15
	blockedRestBetweenRounds    = 60
	blockedSquatReps            = 8
	blockedPushUpReps           = 12
	blockedLungeReps            = 10
	blockedLungeWeight          = 12.5
	blockedSetInterval          = 4 * time.Minute
)

// seedActiveBlocks gives the active persona a workout that carries the blocks
// it was trained in, so beta shows a session recorded as a circuit rather than
// as a flat list of sets.
func seedActiveBlocks(exec bob.Executor, f *factory.Factory, active *models.User) *models.Workout {
	squat := exerciseByTitle(exec, active, factory.TitleBackSquat)
	pushUp := exerciseByTitle(exec, active, factory.TitlePushUp)
	lunge := exerciseByTitle(exec, active, factory.TitleWalkingLunge)

	finishedAt := factory.Now().Add(-blockedWorkoutFinished).Truncate(time.Minute)
	startedAt := finishedAt.Add(-blockedWorkoutLength)
	workout := f.NewWorkout(
		factory.WorkoutUserID(active.ID),
		factory.WorkoutName(blockedWorkoutName),
		factory.WorkoutStartedAt(startedAt),
		factory.WorkoutFinishedAt(finishedAt),
		factory.WorkoutCreatedAt(finishedAt),
	)

	straight := f.NewWorkoutGroup(workout)
	squatOccurrence := f.AddWorkoutGroupExercise(straight, squat)[0]

	circuit := f.NewWorkoutGroup(
		workout,
		factory.WorkoutGroupCircuit(blockedRestBetweenExercises, blockedRestBetweenRounds),
		factory.WorkoutGroupRounds(blockedCircuitRounds),
	)
	circuitOccurrences := f.AddWorkoutGroupExercise(circuit, pushUp, lunge)

	type blockedSet struct {
		exercise   *models.Exercise
		occurrence *models.WorkoutGroupExercise
		position   int
		weight     float64
		reps       int
	}

	// The squats first, then the circuit round by round, which is the order the
	// session was worked in and the order the sets are read back in.
	blocked := make([]blockedSet, 0, blockedStraightSets+blockedCircuitRounds*len(circuitOccurrences))
	for _, weight := range []float64{60, 65, 65} {
		blocked = append(blocked, blockedSet{
			exercise:   squat,
			occurrence: squatOccurrence,
			position:   len(blocked),
			weight:     weight,
			reps:       blockedSquatReps,
		})
	}
	for round := range blockedCircuitRounds {
		blocked = append(
			blocked,
			blockedSet{
				exercise:   pushUp,
				occurrence: circuitOccurrences[0],
				position:   round,
				reps:       blockedPushUpReps,
			},
			blockedSet{
				exercise:   lunge,
				occurrence: circuitOccurrences[1],
				position:   round,
				weight:     blockedLungeWeight,
				reps:       blockedLungeReps,
			},
		)
	}

	setBatch := make([][]factory.SetOpt, 0, len(blocked))
	for index, set := range blocked {
		setBatch = append(setBatch, []factory.SetOpt{
			factory.SetUserID(active.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(set.exercise.ID),
			factory.SetWeight(set.weight),
			factory.SetReps(set.reps),
			factory.SetPosition(set.position),
			factory.SetWorkoutGroupExerciseID(set.occurrence.ID),
			factory.SetCreatedAt(startedAt.Add(time.Duration(index+1) * blockedSetInterval)),
		})
	}
	f.NewSetBatch(setBatch...)

	return workout
}

// exerciseByTitle is the persona's own exercise of that name. The seeded
// library holds every title in factory's list, so a miss is a seed that has
// stopped building what it says it does.
func exerciseByTitle(exec bob.Executor, user *models.User, title string) *models.Exercise {
	exercise, err := models.Exercises.Query(
		models.SelectWhere.Exercises.UserID.EQ(user.ID),
		models.SelectWhere.Exercises.Title.EQ(title),
	).One(context.Background(), exec)
	if err != nil {
		panic(fmt.Errorf("retrieve %q for the persona's blocks: %w", title, err))
	}

	return exercise
}
