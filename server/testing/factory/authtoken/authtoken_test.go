package authtoken_test

import (
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory/authtoken"
)

var errLookupUnavailable = errors.New("connection refused")

func TestAuthNormalizesTheAddressItLooksUp(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name string
		raw  string
	}{
		{name: "upper case", raw: "Alex@Getstronger.TEST"},
		{name: "surrounding space", raw: "  alex@getstronger.test  "},
		{name: "inner space", raw: "alex @getstronger.test"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			var looked string
			_, err := authtoken.Auth(context.Background(), func(_ context.Context, email string) (*models.Auth, error) {
				looked = email
				return &models.Auth{EmailToken: uuid.Must(uuid.NewV4())}, nil
			}, test.raw)

			require.NoError(t, err)
			// Signup folds the address before storing it, so a command that
			// looks one up any other way matches no row.
			require.Equal(t, "alex@getstronger.test", looked)
		})
	}
}

func TestAuthReportsAnAddressNoAccountHolds(t *testing.T) {
	t.Parallel()

	_, err := authtoken.Auth(context.Background(), func(context.Context, string) (*models.Auth, error) {
		return nil, sql.ErrNoRows
	}, "nobody@getstronger.test")

	require.ErrorIs(t, err, sql.ErrNoRows)
}

func TestAuthReturnsTheAccountItFound(t *testing.T) {
	t.Parallel()

	token := uuid.Must(uuid.NewV4())
	auth, err := authtoken.Auth(context.Background(), func(context.Context, string) (*models.Auth, error) {
		return &models.Auth{EmailToken: token}, nil
	}, "alex@getstronger.test")

	require.NoError(t, err)
	require.Equal(t, token, auth.EmailToken)
}

func TestAuthPassesAFailingLookupBack(t *testing.T) {
	t.Parallel()

	_, err := authtoken.Auth(context.Background(), func(context.Context, string) (*models.Auth, error) {
		return nil, errLookupUnavailable
	}, "alex@getstronger.test")

	require.ErrorIs(t, err, errLookupUnavailable)
}
