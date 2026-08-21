package factory

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Faker usernames reach fifty characters, so roughly one generated user in
// four hundred used to overflow users.username and panic the suite it ran in.
func TestNextUsername(t *testing.T) {
	t.Parallel()

	f := NewFactory(nil)
	seen := make(map[string]bool)

	for range 100000 {
		username := f.nextUsername()
		require.LessOrEqual(t, len([]rune(username)), usernameMaxLength, "username %q is too long for the column", username)
		require.False(t, seen[username], "username %q was generated twice", username)
		seen[username] = true
	}
}
