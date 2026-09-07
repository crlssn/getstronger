package training_test

import (
	"strings"
	"testing"
	"time"

	"github.com/crlssn/getstronger/server/training"
)

func TestRecordingValidation(t *testing.T) {
	period := training.Period{StartedAt: time.UnixMilli(1000), FinishedAt: time.UnixMilli(121000)}
	valid := `{"version":1,"startedAt":1000,"endedAt":121000,"phases":[{"exerciseId":"a","stationKey":"a","name":"Walk","round":1,"durationSeconds":120,"instruction":"Walk"}],"pauses":[],"points":[{"timestamp":2000,"latitude":51,"longitude":0,"accuracy":3}],"interrupted":false}`
	// A session with no set length names no duration at all: one interval that
	// ran until the athlete ended it.
	open := `{"version":1,"startedAt":1000,"endedAt":121000,"phases":[{"exerciseId":"a","stationKey":"a","name":"Bike commute","round":1,"instruction":"Bike commute"}],"pauses":[],"points":[{"timestamp":2000,"latitude":51,"longitude":0,"accuracy":3}],"interrupted":false}`
	// An interval routine's phases say which part of it they came from.
	interval := strings.Replace(valid, `"instruction":"Walk"`, `"instruction":"Walk","role":"warmup"`, 1)
	for name, raw := range map[string]string{
		"legacy":        "",
		"recorded":      valid,
		"open interval": open,
		"interval role": interval,
	} {
		t.Run(name, func(t *testing.T) {
			if err := training.ValidateRecording(raw, period); err != nil {
				t.Fatal(err)
			}
		})
	}
	for name, raw := range map[string]string{
		"trailing JSON":       valid + `{}`,
		"outside workout":     strings.Replace(valid, `"startedAt":1000`, `"startedAt":0`, 1),
		"not finished":        strings.Replace(valid, `"endedAt":121000`, `"endedAt":0`, 1),
		"unknown version":     strings.Replace(valid, `"version":1`, `"version":2`, 1),
		"invalid coordinates": strings.Replace(valid, `"latitude":51`, `"latitude":91`, 1),
		"future GPS":          strings.Replace(valid, `"timestamp":2000`, `"timestamp":122000`, 1),
		"zero duration":       strings.Replace(valid, `"durationSeconds":120`, `"durationSeconds":0`, 1),
		// An open interval says how the session ended, so a recording holding
		// one beside a prescription says two contradictory things.
		"open beside timed": strings.Replace(open, `"phases":[`, `"phases":[{"exerciseId":"b","stationKey":"b","name":"Walk","round":1,"durationSeconds":60,"instruction":"Walk"},`, 1),
		"open pause":        strings.Replace(valid, `"pauses":[]`, `"pauses":[{"startedAt":2000}]`, 1),
		"unknown role":      strings.Replace(interval, `"role":"warmup"`, `"role":"sprint"`, 1),
		"oversized":         strings.Repeat(" ", 5000001),
	} {
		t.Run(name, func(t *testing.T) {
			if err := training.ValidateRecording(raw, period); err == nil {
				t.Fatal("accepted invalid recording")
			}
		})
	}
}
