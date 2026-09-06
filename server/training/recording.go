package training

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"strings"
	"time"
)

// ErrInvalidRecording is a recording the server will not store: malformed,
// outside its workout, or beyond the bounds a device could have produced.
var ErrInvalidRecording = errors.New("invalid workout recording")

// The bounds a recording is held to. They cap what one workout can cost to
// store and parse rather than describe a plausible session: a day of one-second
// GPS fixes is well inside them.
const (
	recordingVersion         = 1
	recordingMaxBytes        = 5_000_000
	recordingMaxDuration     = 24 * time.Hour
	recordingMaxPhases       = 10_000
	recordingMaxPauses       = 10_000
	recordingMaxPoints       = 100_000
	recordingMaxRound        = 99
	recordingMaxName         = 1_000
	recordingMaxInstruction  = 2_000
	recordingMaxExerciseID   = 36
	recordingMaxStationKey   = 50
	recordingMaxLatitude     = 90
	recordingMaxLongitude    = 180
	recordingPhaseMaxSeconds = int(recordingMaxDuration / time.Second)
)

type recordingPhase struct {
	ExerciseID      string `json:"exerciseId"`
	StationKey      string `json:"stationKey"`
	Name            string `json:"name"`
	Round           int    `json:"round"`
	DurationSeconds int    `json:"durationSeconds"`
	Instruction     string `json:"instruction"`
}

type recordingPause struct {
	StartedAt int64 `json:"startedAt"`
	EndedAt   int64 `json:"endedAt"`
}

type recordingPoint struct {
	Timestamp int64   `json:"timestamp"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Accuracy  float64 `json:"accuracy"`
}

// recording mirrors the document the mobile app records natively and the web
// app renders; the server only checks it, so the shape lives in one place per
// client and here.
type recording struct {
	Version     int              `json:"version"`
	StartedAt   int64            `json:"startedAt"`
	EndedAt     int64            `json:"endedAt"`
	Phases      []recordingPhase `json:"phases"`
	Pauses      []recordingPause `json:"pauses"`
	Points      []recordingPoint `json:"points"`
	Interrupted bool             `json:"interrupted"`
}

// ValidateRecording checks a recording before it is stored with its workout.
// An empty recording is a workout logged by hand and always passes; anything
// else must be one well-formed document that fits inside the workout's period.
func ValidateRecording(raw string, period Period) error {
	if raw == "" {
		return nil
	}
	if len(raw) > recordingMaxBytes {
		return ErrInvalidRecording
	}

	data, err := decodeRecording(raw)
	if err != nil {
		return err
	}
	if err = data.validateSpan(period); err != nil {
		return err
	}
	if err = data.validatePhases(); err != nil {
		return err
	}
	if err = data.validatePauses(); err != nil {
		return err
	}

	return data.validatePoints()
}

// decodeRecording rejects unknown fields and anything after the document, so
// a stored recording is exactly the shape the clients agree on.
func decodeRecording(raw string) (*recording, error) {
	var data recording
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&data); err != nil {
		return nil, ErrInvalidRecording
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return nil, ErrInvalidRecording
	}

	return &data, nil
}

func (r *recording) validateSpan(period Period) error {
	if r.Version != recordingVersion ||
		r.StartedAt < period.StartedAt.UnixMilli() ||
		r.EndedAt > period.FinishedAt.UnixMilli() ||
		r.EndedAt <= r.StartedAt ||
		r.EndedAt-r.StartedAt > recordingMaxDuration.Milliseconds() ||
		len(r.Phases) == 0 || len(r.Phases) > recordingMaxPhases ||
		len(r.Pauses) > recordingMaxPauses ||
		len(r.Points) > recordingMaxPoints {
		return ErrInvalidRecording
	}

	return nil
}

func (r *recording) validatePhases() error {
	for _, phase := range r.Phases {
		if phase.DurationSeconds < 1 || phase.DurationSeconds > recordingPhaseMaxSeconds ||
			phase.Round < 1 || phase.Round > recordingMaxRound ||
			len(phase.Name) > recordingMaxName ||
			len(phase.Instruction) > recordingMaxInstruction ||
			len(phase.ExerciseID) > recordingMaxExerciseID ||
			len(phase.StationKey) > recordingMaxStationKey {
			return ErrInvalidRecording
		}
	}

	return nil
}

// validatePauses wants pauses in order, closed, and inside the recording: the
// clients close an open pause when a recording ends.
func (r *recording) validatePauses() error {
	last := r.StartedAt
	for _, pause := range r.Pauses {
		if pause.StartedAt < last || pause.EndedAt < pause.StartedAt || pause.EndedAt > r.EndedAt {
			return ErrInvalidRecording
		}
		last = pause.EndedAt
	}

	return nil
}

// validatePoints wants fixes strictly ordered in time, inside the recording,
// and on the globe.
func (r *recording) validatePoints() error {
	last := r.StartedAt - 1
	for _, point := range r.Points {
		if point.Timestamp <= last || point.Timestamp > r.EndedAt ||
			math.Abs(point.Latitude) > recordingMaxLatitude ||
			math.Abs(point.Longitude) > recordingMaxLongitude ||
			point.Accuracy < 0 {
			return ErrInvalidRecording
		}
		last = point.Timestamp
	}

	return nil
}
