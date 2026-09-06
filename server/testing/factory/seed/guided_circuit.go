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

	metresPerDegree    = 111_320.0
	earthRadius        = 6_371_000.0
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
}

type recordedPhase struct {
	ExerciseID      string `json:"exerciseId"`
	StationKey      string `json:"stationKey"`
	Name            string `json:"name"`
	Round           int    `json:"round"`
	DurationSeconds int    `json:"durationSeconds"`
	Instruction     string `json:"instruction"`
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
func seedActiveGuidedCircuit(f *factory.Factory, active *models.User, run *models.Exercise) {
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
	recording := recordGuidedCircuit(walk, run, finishedAt)
	encoded, err := json.Marshal(recording)
	if err != nil {
		panic(fmt.Errorf("encode guided circuit recording: %w", err))
	}

	workout := f.NewWorkout(
		factory.WorkoutUserID(active.ID),
		factory.WorkoutRoutineID(routine.ID),
		factory.WorkoutName(guidedCircuitName),
		factory.WorkoutStartedAt(time.UnixMilli(recording.StartedAt).UTC()),
		factory.WorkoutFinishedAt(finishedAt),
		factory.WorkoutCreatedAt(finishedAt),
		factory.WorkoutRecordingJSON(string(encoded)),
	)

	// One set per interval, holding what the route measured for it.
	setBatch := make([][]factory.SetOpt, 0, len(recording.Phases))
	start := recording.StartedAt
	for index, phase := range recording.Phases {
		end := start + int64(phase.DurationSeconds)*int64(time.Second/time.Millisecond)
		setBatch = append(setBatch, []factory.SetOpt{
			factory.SetUserID(active.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(phase.ExerciseID),
			factory.SetWeight(0),
			factory.SetReps(0),
			factory.SetDistance(recording.metresBetween(start, end) / metresPerKm),
			factory.SetDurationSeconds(phase.DurationSeconds),
			factory.SetCreatedAt(time.UnixMilli(end).UTC().Add(time.Duration(index) * time.Millisecond)),
		})
		start = end
	}
	f.NewSetBatch(setBatch...)
}

// recordGuidedCircuit lays the prescription out as phases and walks and runs
// the loop at a steady pace, a GPS fix every few seconds.
func recordGuidedCircuit(walk, run *models.Exercise, finishedAt time.Time) recordedCircuit {
	phases := make([]recordedPhase, 0, guidedStationsPerRound*guidedCircuitRounds)
	for round := 1; round <= guidedCircuitRounds; round++ {
		phases = append(
			phases,
			guidedPhase(walk, round, guidedWalkSeconds),
			guidedPhase(run, round, guidedRunSeconds),
		)
	}

	total := time.Duration(guidedCircuitRounds*(guidedWalkSeconds+guidedRunSeconds)) * time.Second
	startedAt := finishedAt.Add(-total)
	recording := recordedCircuit{
		Version:   1,
		StartedAt: startedAt.UnixMilli(),
		EndedAt:   finishedAt.UnixMilli(),
		Phases:    phases,
		Pauses:    []recordedPause{},
		Points:    []recordedPoint{},
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

		// Advance along the ellipse by what the pace covers in one interval,
		// dividing by the arc length one radian spans at this angle.
		metres := recording.paceAt(elapsed) * guidedFixInterval.Seconds()
		arc := math.Hypot(guidedLoopEastMetres*math.Sin(angle), guidedLoopNorthMetre*math.Cos(angle))
		angle += metres / arc
	}

	return recording
}

func guidedPhase(exercise *models.Exercise, round, seconds int) recordedPhase {
	return recordedPhase{
		ExerciseID:      exercise.ID.String(),
		StationKey:      exercise.ID.String(),
		Name:            exercise.Title,
		Round:           round,
		DurationSeconds: seconds,
		Instruction:     fmt.Sprintf("%s for %d seconds", exercise.Title, seconds),
	}
}

// paceAt is how fast the athlete moves this far into the session: the walk's
// pace during a walk, the run's during a run.
func (r recordedCircuit) paceAt(elapsed time.Duration) float64 {
	var boundary time.Duration
	for _, phase := range r.Phases {
		boundary += time.Duration(phase.DurationSeconds) * time.Second
		if elapsed < boundary {
			if phase.DurationSeconds == guidedWalkSeconds {
				return guidedWalkMetresPerS
			}

			return guidedRunMetresPerS
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
