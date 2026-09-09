package main

import (
	"encoding/json"
	"fmt"
	"math"
	"time"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// The guided circuit the active persona trains: six rounds of a two-minute
// walk and a four-minute run, recorded once around a lake with the phone in
// a pocket. The route map, its legend and the per-interval distances need a
// saved recording to show, and this is the one they show.
const (
	guidedCircuitName     = "Walk/Run Intervals"
	guidedCircuitRounds   = 6
	guidedWalkSeconds     = 120
	guidedRunSeconds      = 240
	guidedWalkMetresPerS  = 1.4
	guidedRunMetresPerS   = 3.0
	guidedFixInterval     = 5 * time.Second
	guidedFixAccuracy     = 5.0
	guidedCircuitFinished = 2 * time.Hour

	// The loop the route follows: an ellipse a kilometre long and seven
	// hundred metres across, which six rounds go once around.
	guidedLoopLatitude   = 59.3326
	guidedLoopLongitude  = 18.0649
	guidedLoopEastMetres = 1000.0
	guidedLoopNorthMetre = 700.0

	guidedStationsPerRound = 2
	guidedArcStepMetres    = 0.1

	// The first time a session trains an exercise; a second station of the same
	// exercise is the occurrence after it.
	firstOccurrence = 1

	earthRadius = 6_371_000.0
	// Derived from the same sphere the haversine measures on, so a metre laid
	// down here reads as a metre when the route is measured back.
	metresPerDegree    = earthRadius * math.Pi / degreesPerHalfTurn
	metresPerKm        = 1000.0
	degreesPerHalfTurn = 180.0
)

// recordedCircuit is the document the mobile app records and the web app
// renders, in the shape training.ValidateRecording accepts.
type recordedCircuit struct {
	Version     int             `json:"version"`
	StartedAt   int64           `json:"startedAt"`
	EndedAt     int64           `json:"endedAt"`
	Phases      []recordedPhase `json:"phases"`
	Pauses      []recordedPause `json:"pauses"`
	Points      []recordedPoint `json:"points"`
	Interrupted bool            `json:"interrupted"`

	// How fast each exercise is worked, by name. Unexported because it lays the
	// route down rather than travelling with the document the app reads back.
	pace map[string]float64
}

type recordedPhase struct {
	ExerciseID      string `json:"exerciseId"`
	StationKey      string `json:"stationKey"`
	Name            string `json:"name"`
	Round           int    `json:"round"`
	DurationSeconds int    `json:"durationSeconds"`
	Instruction     string `json:"instruction"`
	// Where the block this came from sits in an interval routine; empty for a
	// gym circuit, which reads as its groups and its rounds instead.
	Role string `json:"role,omitempty"`
}

type recordedPause struct {
	StartedAt int64 `json:"startedAt"`
	EndedAt   int64 `json:"endedAt"`
}

type recordedPoint struct {
	Timestamp int64   `json:"timestamp"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Accuracy  float64 `json:"accuracy"`
}

// seedActiveGuidedCircuit gives the active persona a walk/run circuit held
// against the clock and one session of it recorded on a phone, so the saved
// route has somewhere to be looked at on the web.
func seedActiveGuidedCircuit(f *factory.Factory, active *models.User, run *models.Exercise) *models.Exercise {
	walk := f.NewExercise(
		factory.ExerciseUserID(active.ID),
		factory.ExerciseTitle("Walk"),
		factory.ExerciseTags("Cardio"),
		factory.ExerciseMetrics("distance", "time"),
	)

	routine := f.NewRoutine(factory.RoutineUserID(active.ID), factory.RoutineName(guidedCircuitName))
	f.NewRoutineGroup(routine, factory.RoutineGroupCircuit(0, 0), factory.RoutineGroupRounds(guidedCircuitRounds))
	f.AddTimedRoutineExercise(routine, guidedWalkSeconds, walk)
	f.AddTimedRoutineExercise(routine, guidedRunSeconds, run)

	// On the minute, the way the API stores a workout's clock.
	finishedAt := factory.Now().Add(-guidedCircuitFinished).Truncate(time.Minute)

	phases := make([]recordedPhase, 0, guidedStationsPerRound*guidedCircuitRounds)
	for round := 1; round <= guidedCircuitRounds; round++ {
		phases = append(
			phases,
			guidedPhase(walk, round, guidedWalkSeconds, "", firstOccurrence),
			guidedPhase(run, round, guidedRunSeconds, "", firstOccurrence),
		)
	}

	recording := recordSession(phases, pacePerExercise(walk, run), finishedAt)
	blocks := []sessionBlock{{
		rounds: guidedCircuitRounds,
		stations: []sessionStation{
			{key: stationKey(walk, firstOccurrence), exercise: walk},
			{key: stationKey(run, firstOccurrence), exercise: run},
		},
	}}
	saveRecordedSession(f, active, routine, guidedCircuitName, recording, finishedAt, blocks)

	return walk
}

// pacePerExercise is how fast each of the two movements is worked, by the name
// the phases carry.
func pacePerExercise(walk, run *models.Exercise) map[string]float64 {
	return map[string]float64{walk.Title: guidedWalkMetresPerS, run.Title: guidedRunMetresPerS}
}

// sessionBlock is one block of a recorded session: how many times it was
// worked through, and the stations whose intervals it holds. A station is
// named by the key the recording's phases carry, which is how each set finds
// the block that logged it.
type sessionBlock struct {
	rounds   int32
	stations []sessionStation
}

type sessionStation struct {
	key      string
	exercise *models.Exercise
}

// saveRecordedSession stores the recording as a finished workout, with one set
// per interval holding what the route measured for it, and the blocks it was
// held against the clock in.
func saveRecordedSession(
	f *factory.Factory, active *models.User, routine *models.Routine,
	name string, recording recordedCircuit, finishedAt time.Time, blocks []sessionBlock,
) {
	encoded, err := json.Marshal(recording)
	if err != nil {
		panic(fmt.Errorf("encode recorded session: %w", err))
	}

	workout := f.NewWorkout(
		factory.WorkoutUserID(active.ID),
		factory.WorkoutRoutineID(routine.ID),
		factory.WorkoutName(name),
		factory.WorkoutStartedAt(time.UnixMilli(recording.StartedAt).UTC()),
		factory.WorkoutFinishedAt(finishedAt),
		factory.WorkoutCreatedAt(finishedAt),
		factory.WorkoutRecordingJSON(string(encoded)),
	)

	occurrences := writeSessionBlocks(f, workout, blocks)

	setBatch := make([][]factory.SetOpt, 0, len(recording.Phases))
	positions := make(map[string]int, len(blocks))
	start := recording.StartedAt
	for index, phase := range recording.Phases {
		end := start + int64(phase.DurationSeconds)*int64(time.Second/time.Millisecond)
		occurrence, ok := occurrences[phase.StationKey]
		if !ok {
			panic(fmt.Errorf("recorded session %q has no block for station %q", name, phase.StationKey)) //nolint:err113
		}
		setBatch = append(setBatch, []factory.SetOpt{
			factory.SetUserID(active.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(phase.ExerciseID),
			factory.SetWeight(0),
			factory.SetReps(0),
			factory.SetDistance(recording.metresBetween(start, end) / metresPerKm),
			factory.SetDurationSeconds(phase.DurationSeconds),
			factory.SetPosition(positions[phase.ExerciseID]),
			factory.SetWorkoutGroupExerciseID(occurrence.ID),
			factory.SetCreatedAt(time.UnixMilli(end).UTC().Add(time.Duration(index) * time.Millisecond)),
		})
		positions[phase.ExerciseID]++
		start = end
	}
	f.NewSetBatch(setBatch...)
}

// writeSessionBlocks stores the blocks the session was worked in and returns
// the occurrence each station's intervals belong to, by station key.
func writeSessionBlocks(
	f *factory.Factory, workout *models.Workout, blocks []sessionBlock,
) map[string]*models.WorkoutGroupExercise {
	occurrences := make(map[string]*models.WorkoutGroupExercise)
	for _, block := range blocks {
		// Every recorded block is held against the clock, so every one of them
		// is a circuit.
		group := f.NewWorkoutGroup(
			workout,
			factory.WorkoutGroupCircuit(0, 0),
			factory.WorkoutGroupRounds(block.rounds),
		)
		for _, station := range block.stations {
			occurrences[station.key] = f.AddWorkoutGroupExercise(group, station.exercise)[0]
		}
	}

	return occurrences
}

// recordSession walks and runs the loop through the phases it is given, at the
// pace each exercise is worked at, with a GPS fix every few seconds.
func recordSession(
	phases []recordedPhase, pace map[string]float64, finishedAt time.Time,
) recordedCircuit {
	var total time.Duration
	for _, phase := range phases {
		total += time.Duration(phase.DurationSeconds) * time.Second
	}

	startedAt := finishedAt.Add(-total)
	recording := recordedCircuit{
		Version:   1,
		StartedAt: startedAt.UnixMilli(),
		EndedAt:   finishedAt.UnixMilli(),
		Phases:    phases,
		Pauses:    []recordedPause{},
		Points:    []recordedPoint{},
		pace:      pace,
	}

	angle := 0.0
	for elapsed := time.Duration(0); elapsed <= total; elapsed += guidedFixInterval {
		east := guidedLoopEastMetres * math.Cos(angle)
		north := guidedLoopNorthMetre * math.Sin(angle)
		latitude := guidedLoopLatitude + north/metresPerDegree
		recording.Points = append(recording.Points, recordedPoint{
			Timestamp: startedAt.Add(elapsed).UnixMilli(),
			Latitude:  latitude,
			Longitude: guidedLoopLongitude + east/(metresPerDegree*math.Cos(radians(guidedLoopLatitude))),
			Accuracy:  guidedFixAccuracy,
		})

		// Advance along the ellipse by what the pace covers in one interval, in
		// small steps so the arc length is read where each step is taken: one
		// step per fix drifted the intervals a few metres either side of the
		// prescription.
		remaining := recording.paceAt(elapsed) * guidedFixInterval.Seconds()
		for remaining > 0 {
			step := math.Min(remaining, guidedArcStepMetres)
			arc := math.Hypot(guidedLoopEastMetres*math.Sin(angle), guidedLoopNorthMetre*math.Cos(angle))
			angle += step / arc
			remaining -= step
		}
	}

	return recording
}

// guidedPhase is one interval of a recording. The station key names the
// occurrence rather than the exercise: a walk-run walks in the warm-up and
// again in the block, and the two are separate stations of one session — which
// is what the web app's own circuitPhases writes, and what keeps a round's
// intervals telling themselves apart.
func guidedPhase(exercise *models.Exercise, round, seconds int, role string, occurrence int) recordedPhase {
	return recordedPhase{
		ExerciseID:      exercise.ID.String(),
		StationKey:      stationKey(exercise, occurrence),
		Name:            exercise.Title,
		Round:           round,
		DurationSeconds: seconds,
		Instruction:     fmt.Sprintf("%s for %d seconds", exercise.Title, seconds),
		Role:            role,
	}
}

// stationKey names one station of a session: the exercise, and which of its
// stations this is when the session trains it more than once.
func stationKey(exercise *models.Exercise, occurrence int) string {
	if occurrence > 1 {
		return fmt.Sprintf("%s#%d", exercise.ID, occurrence)
	}

	return exercise.ID.String()
}

// paceAt is how fast the athlete moves this far into the session: the walk's
// pace during a walk, the run's during a run.
func (r recordedCircuit) paceAt(elapsed time.Duration) float64 {
	var boundary time.Duration
	for _, phase := range r.Phases {
		boundary += time.Duration(phase.DurationSeconds) * time.Second
		if elapsed < boundary {
			return r.pace[phase.Name]
		}
	}

	return guidedWalkMetresPerS
}

// metresBetween adds up the route between two instants, the way the web app
// attributes distance to an interval: every fix-to-fix edge inside it.
func (r recordedCircuit) metresBetween(start, end int64) float64 {
	var metres float64
	for index := 1; index < len(r.Points); index++ {
		a, b := r.Points[index-1], r.Points[index]
		if a.Timestamp >= start && b.Timestamp <= end {
			metres += haversineMetres(a, b)
		}
	}

	return metres
}

// haversineMetres is the great-circle distance between two fixes.
func haversineMetres(a, b recordedPoint) float64 {
	const half = 2
	sinHalfSquared := func(degrees float64) float64 {
		sin := math.Sin(radians(degrees) / half)

		return sin * sin
	}

	h := sinHalfSquared(b.Latitude-a.Latitude) +
		math.Cos(radians(a.Latitude))*math.Cos(radians(b.Latitude))*sinHalfSquared(b.Longitude-a.Longitude)

	return earthRadius * half * math.Asin(math.Sqrt(math.Min(1, h)))
}

func radians(degrees float64) float64 {
	return degrees * math.Pi / degreesPerHalfTurn
}
