package v1

import (
	"errors"
	"fmt"
	"testing"
)

func TestNormalizeExerciseTags(t *testing.T) {
	t.Run("accepts and trims up to 10 tags", func(t *testing.T) {
		tags := make([]string, maxExerciseTags)
		for index := range tags {
			tags[index] = fmt.Sprintf(" tag %d ", index)
		}

		normalized, err := normalizeExerciseTags(tags)
		if err != nil {
			t.Fatalf("normalize tags: %v", err)
		}
		if len(normalized) != maxExerciseTags {
			t.Fatalf("got %d tags, want %d", len(normalized), maxExerciseTags)
		}
		if normalized[0] != "tag 0" {
			t.Fatalf("first tag = %q, want %q", normalized[0], "tag 0")
		}
	})

	t.Run("rejects more than 10 tags", func(t *testing.T) {
		_, err := normalizeExerciseTags(make([]string, maxExerciseTags+1))
		if !errors.Is(err, ErrInvalidExerciseTags) {
			t.Fatalf("error = %v, want %v", err, ErrInvalidExerciseTags)
		}
	})

	t.Run("rejects duplicates ignoring case", func(t *testing.T) {
		_, err := normalizeExerciseTags([]string{"Strength", "strength"})
		if !errors.Is(err, ErrInvalidExerciseTags) {
			t.Fatalf("error = %v, want %v", err, ErrInvalidExerciseTags)
		}
	})
}
