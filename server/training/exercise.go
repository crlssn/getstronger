package training

import (
	"errors"
	"strings"
)

// MaxExerciseTags caps how many tags an exercise may carry; the database
// enforces the same limit.
const MaxExerciseTags = 10

// DefaultRestSeconds is how long a plain weight-and-reps lift rests between
// sets when the athlete does not say.
const DefaultRestSeconds = 90

var (
	ErrInvalidExerciseTags   = errors.New("exercise tags must contain no more than 10 non-empty, trimmed, unique values")
	ErrInvalidExerciseMetric = errors.New("exercise must contain one or more unique measurements")
)

// Metric is what an exercise measures a set by.
type Metric string

const (
	MetricWeight   Metric = "weight"
	MetricReps     Metric = "reps"
	MetricDistance Metric = "distance"
	MetricTime     Metric = "time"
)

// Valid reports whether the metric is one this context measures by.
func (m Metric) Valid() bool {
	switch m {
	case MetricWeight, MetricReps, MetricDistance, MetricTime:
		return true
	default:
		return false
	}
}

// String renders the metric as it is stored.
func (m Metric) String() string {
	return string(m)
}

// DefaultMetrics are what an exercise measures when the athlete does not say:
// a conventional weights lift.
func DefaultMetrics() []Metric {
	return []Metric{MetricWeight, MetricReps}
}

// NormalizeMetrics settles what an exercise measures. Asking for nothing means
// a conventional weights lift; asking twice for the same measurement is
// harmless and collapses, but an unrecognised measurement is not.
func NormalizeMetrics(metrics []Metric) ([]Metric, error) {
	if len(metrics) == 0 {
		return DefaultMetrics(), nil
	}

	normalized := make([]Metric, 0, len(metrics))
	seen := make(map[Metric]struct{}, len(metrics))
	for _, metric := range metrics {
		if !metric.Valid() {
			return nil, ErrInvalidExerciseMetric
		}
		if _, duplicate := seen[metric]; duplicate {
			continue
		}
		seen[metric] = struct{}{}
		normalized = append(normalized, metric)
	}

	return normalized, nil
}

// MetricStrings renders metrics for the store, which keeps them as text.
func MetricStrings(metrics []Metric) []string {
	values := make([]string, 0, len(metrics))
	for _, metric := range metrics {
		values = append(values, metric.String())
	}

	return values
}

// NormalizeExerciseTags trims the tags an exercise is filed under and rejects
// a set that is too long, blank in places, or repeats itself. Tags differing
// only in case are the same tag, but keep the casing the athlete typed.
func NormalizeExerciseTags(tags []string) ([]string, error) {
	if len(tags) > MaxExerciseTags {
		return nil, ErrInvalidExerciseTags
	}

	normalized := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" {
			return nil, ErrInvalidExerciseTags
		}

		key := strings.ToLower(tag)
		if _, duplicate := seen[key]; duplicate {
			return nil, ErrInvalidExerciseTags
		}
		seen[key] = struct{}{}
		normalized = append(normalized, tag)
	}

	return normalized, nil
}

// RestSeconds settles how long a new exercise rests between sets. An exercise
// created without naming its measurements is a conventional weights lift, so it
// gets a default rest period; one that names them keeps whatever it asked for,
// including no rest at all.
func RestSeconds(requested int, requestedMetrics []Metric) int {
	if len(requestedMetrics) == 0 && requested == 0 {
		return DefaultRestSeconds
	}

	return requested
}
