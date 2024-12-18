//go:build external
// +build external

package email

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

func TestSendEmail(t *testing.T) {
	t.Parallel()
	email := MustNew(&config.Config{})

	err := email.SendVerificationEmail(context.Background(), SendVerificationEmail{
		Name:  "John Doe",
		Email: os.Getenv("GET_STRONGER_EMAIL_ADDRESS"),
		Token: "1234",
	})
	require.NoError(t, err)
}
