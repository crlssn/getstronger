package username_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/username"
)

func TestIsReserved(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name     string
		username string
		reserved bool
	}{
		{"brand", "getstronger", true},
		{"brand mixed case", "GetStronger", true},
		{"brand as a prefix", "GetStrongerFan", true},
		{"brand as a suffix", "officialgetstronger", true},
		{"brand between separators", "my_get_stronger_journey", true},
		{"brand under mixed separators", "xX.get.stronger.Xx", true},
		{"brand hyphenated", "GET-STRONGER", true},

		{"short form", "gs", true},
		{"short form padded", "  GS  ", true},
		{"long short form", "gstronger", true},
		{"route", "login", true},
		{"route mixed case", "Progress", true},
		{"route with a separator", "verify-email", true},
		{"route already stripped", "forgotpassword", true},
		{"route with a foreign separator", "reset_password", true},

		{"a word the brand only starts", "getstrong", false},
		{"a word the brand only ends", "stronger", false},
		{"a strongman", "strongman", false},
		{"a person", "mikeb", false},
		{"a person with separators", "mike.b_1", false},
		{"a route as a substring", "loginsky", false},
		{"empty", "", false},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.reserved, username.IsReserved(test.username))
		})
	}
}
