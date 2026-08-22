package e2e

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/require"
)

// The signup request is validated against this pattern, so a fake username the
// pattern rejects fails the saga at its first step — which is how gofakeit's
// apostrophes and hyphens turned TestE2E into an occasional red build.
func TestFakeUsernameIsAcceptedBySignup(t *testing.T) {
	t.Parallel()

	const (
		pattern   = `^[A-Za-z0-9_.]+$`
		minLength = 3
		maxLength = 30
		draws     = 2000
	)

	accepted := regexp.MustCompile(pattern)
	for range draws {
		username := fakeUsername()

		require.Regexp(t, accepted, username)
		require.GreaterOrEqual(t, len(username), minLength)
		require.LessOrEqual(t, len(username), maxLength)
	}
}
