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
	// A recording that held itself while the athlete stood still carries the
	// speed it judged that by, and marks the pauses it opened as its own.
	held := strings.Replace(valid, `"pauses":[]`, `"pauses":[{"startedAt":2000,"endedAt":3000,"auto":true}]`, 1)
	held = strings.Replace(held, `"accuracy":3`, `"accuracy":3,"speed":0`, 1)
	for name, raw := range map[string]string{
		"legacy":        "",
		"recorded":      valid,
		"open interval": open,
		"interval role": interval,
		"auto-paused":   held,
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
		// The role is an enum whose UnmarshalText refuses a value it does not
		// know, so an unknown one never reaches the checks after the decode.
		"role the decoder refuses": strings.Replace(interval, `"role":"warmup"`, `"role":"sprint"`, 1),
		"negative speed":           strings.Replace(held, `"speed":0`, `"speed":-1`, 1),
		"oversized":                strings.Repeat(" ", 5000001),
		// The caps on a phase are what bound the cost of storing one workout.
		"round below one":  strings.Replace(valid, `"round":1`, `"round":0`, 1),
		"round above cap":  strings.Replace(valid, `"round":1`, `"round":100`, 1),
		"long name":        strings.Replace(valid, `"name":"Walk"`, `"name":"`+strings.Repeat("a", 1001)+`"`, 1),
		"long instruction": strings.Replace(valid, `"instruction":"Walk"`, `"instruction":"`+strings.Repeat("a", 2001)+`"`, 1),
		"long exercise id": strings.Replace(valid, `"exerciseId":"a"`, `"exerciseId":"`+strings.Repeat("a", 37)+`"`, 1),
		"long station key": strings.Replace(valid, `"stationKey":"a"`, `"stationKey":"`+strings.Repeat("a", 51)+`"`, 1),
		// A second pause opening before the first closed, two fixes claiming one
		// instant, and a fix whose receiver reported a negative radius.
		"pauses out of order": strings.Replace(valid, `"pauses":[]`, `"pauses":[{"startedAt":3000,"endedAt":4000},{"startedAt":2000,"endedAt":2500}]`, 1),
		"repeated GPS fix":    strings.Replace(valid, `"points":[`, `"points":[{"timestamp":2000,"latitude":51,"longitude":0,"accuracy":3},`, 1),
		"negative accuracy":   strings.Replace(valid, `"accuracy":3`, `"accuracy":-1`, 1),
	} {
		t.Run(name, func(t *testing.T) {
			if err := training.ValidateRecording(raw, period); err == nil {
				t.Fatal("accepted invalid recording")
			}
		})
	}
}
