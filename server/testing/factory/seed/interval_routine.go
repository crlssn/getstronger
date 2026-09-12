package main

import (
	"time"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// The interval routine the active persona trains: a five-minute walk to warm
// up, then five rounds of a minute's run and two minutes' walk, the last walk
// dropped so the session ends on the run. It is the shape a walk-run session
// actually has, and the one the finished workout reads straight through.
const (
	intervalRoutineName   = "Walk-Run Intervals"
	intervalWarmupTitle   = "Warm-up"
	intervalRepeatTitle   = "Repeat"
	intervalRounds        = 5
	intervalWarmupSeconds = 300
	intervalRunSeconds    = 60
	intervalWalkSeconds   = 120
	intervalFinished      = 26 * time.Hour
)

// seedActiveIntervalRoutine gives the active persona an interval routine and
// one recorded session of it, so the numbered sequence and its per-interval
// pace have somewhere to be looked at on the web.
func seedActiveIntervalRoutine(f *factory.Factory, active *models.User, walk, run *models.Exercise) {
	routine := f.NewRoutine(
		factory.RoutineUserID(active.ID),
		factory.RoutineName(intervalRoutineName),
	)

	f.NewRoutineGroup(
		routine,
		factory.RoutineGroupCircuit(0, 0),
		factory.RoutineGroupRounds(1),
		factory.RoutineGroupRole(enums.RoutineGroupRoleWarmup, false),
		factory.RoutineGroupTitle(intervalWarmupTitle),
	)
	f.AddTimedRoutineExercise(routine, intervalWarmupSeconds, walk)

	f.NewRoutineGroup(
		routine,
		factory.RoutineGroupCircuit(0, 0),
		factory.RoutineGroupRounds(intervalRounds),
		factory.RoutineGroupRole(enums.RoutineGroupRoleRepeat, true),
		factory.RoutineGroupTitle(intervalRepeatTitle),
	)
	f.AddTimedRoutineExercise(routine, intervalRunSeconds, run)
	f.AddTimedRoutineExercise(routine, intervalWalkSeconds, walk)

	finishedAt := factory.Now().Add(-intervalFinished).Truncate(time.Minute)
	recording := recordSession(intervalPhases(walk, run), pacePerExercise(walk, run), finishedAt)
	// The two blocks of the routine, as they were worked: the warm-up once,
	// then the repeating block, whose walk is a second station of the same
	// movement.
	blocks := []sessionBlock{
		{
			rounds:   1,
			stations: []sessionStation{{key: stationKey(walk, firstOccurrence), exercise: walk}},
		},
		{
			rounds: intervalRounds,
			stations: []sessionStation{
				{key: stationKey(run, firstOccurrence), exercise: run},
				{key: stationKey(walk, firstOccurrence+1), exercise: walk},
			},
		},
	}
	saveRecordedSession(f, active, routine, intervalRoutineName, recording, finishedAt, blocks)
}

// intervalPhases is the session as it was actually worked: the warm-up once,
// outside the count, then the block round by round with the final walk left out.
func intervalPhases(walk, run *models.Exercise) []recordedPhase {
	warmup := string(enums.RoutineGroupRoleWarmup)
	repeat := string(enums.RoutineGroupRoleRepeat)

	// The warm-up walks, and the block walks again: two stations of one
	// exercise, numbered as the web app numbers them so a round's intervals
	// never answer to the same name.
	phases := []recordedPhase{
		guidedPhase(walk, 1, intervalWarmupSeconds, warmup, firstOccurrence),
	}

	for round := 1; round <= intervalRounds; round++ {
		phases = append(phases, guidedPhase(run, round, intervalRunSeconds, repeat, firstOccurrence))
		if round == intervalRounds {
			continue
		}
		phases = append(phases, guidedPhase(walk, round, intervalWalkSeconds, repeat, firstOccurrence+1))
	}

	return phases
}
