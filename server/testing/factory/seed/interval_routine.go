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
	)
	f.AddTimedRoutineExercise(routine, intervalWarmupSeconds, walk)

	f.NewRoutineGroup(
		routine,
		factory.RoutineGroupCircuit(0, 0),
		factory.RoutineGroupRounds(intervalRounds),
		factory.RoutineGroupRole(enums.RoutineGroupRoleRepeat, true),
	)
	f.AddTimedRoutineExercise(routine, intervalRunSeconds, run)
	f.AddTimedRoutineExercise(routine, intervalWalkSeconds, walk)

	finishedAt := factory.Now().Add(-intervalFinished).Truncate(time.Minute)
	recording := recordSession(intervalPhases(walk, run), pacePerExercise(walk, run), finishedAt)
	saveRecordedSession(f, active, routine, intervalRoutineName, recording, finishedAt)
}

// intervalPhases is the session as it was actually worked: the warm-up once,
// outside the count, then the block round by round with the final walk left out.
func intervalPhases(walk, run *models.Exercise) []recordedPhase {
	phases := []recordedPhase{
		guidedPhase(walk, 1, intervalWarmupSeconds, string(enums.RoutineGroupRoleWarmup)),
	}

	for round := 1; round <= intervalRounds; round++ {
		phases = append(phases, guidedPhase(run, round, intervalRunSeconds, string(enums.RoutineGroupRoleRepeat)))
		if round == intervalRounds {
			continue
		}
		phases = append(phases, guidedPhase(walk, round, intervalWalkSeconds, string(enums.RoutineGroupRoleRepeat)))
	}

	return phases
}
