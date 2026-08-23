package training

import (
	"errors"
	"strings"
)

// MaxExerciseTags caps how many tags an exercise may carry; the database
// enforces the same limit.
const MaxExerciseTags = 10

// DefaultRestSeconds is how long a plain weight-and-reps lift rests between
// sets when nothing says otherwise.
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

// MetricsFromStrings reads back what the store keeps as text.
func MetricsFromStrings(values []string) []Metric {
	metrics := make([]Metric, 0, len(values))
	for _, value := range values {
		metrics = append(metrics, Metric(value))
	}

	return metrics
}

// MetricsLocked reports whether a requested change of measurements must be
// refused. A set is recorded in the columns its exercise measured by at the
// time, and nothing says which those were, so re-reading a logged set under
// different measurements rewrites the athlete's history rather than restating
// it. An exercise nobody has logged yet has no history to protect, and asking
// for the measurements already in force changes nothing whatever order they
// arrive in.
func MetricsLocked(stored, requested []Metric, hasLoggedSets bool) bool {
	return hasLoggedSets && !sameMetrics(stored, requested)
}

// sameMetrics reports whether two normalized sets of measurements measure the
// same thing. Their order is how a form listed them, not what a set means.
func sameMetrics(stored, requested []Metric) bool {
	if len(stored) != len(requested) {
		return false
	}

	seen := make(map[Metric]struct{}, len(stored))
	for _, metric := range stored {
		seen[metric] = struct{}{}
	}

	for _, metric := range requested {
		if _, found := seen[metric]; !found {
			return false
		}
	}

	return true
}
