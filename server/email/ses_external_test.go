//go:build external
// +build external

package email

import (
	"context"
	"os"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/email"
)

func TestSendEmail(t *testing.T) {
	t.Parallel()
	e := email.MustNewSES(&config.Config{
		Server: config.Server{
			AllowedOrigins: []string{os.Getenv("GET_STRONGER_ALLOWED_ORIGIN")},
		},
	})
	err := e.SendVerification(context.Background(), email.SendVerification{
		Name:  "John Doe",
		Email: os.Getenv("GET_STRONGER_EMAIL_ADDRESS"),
		Token: "1234",
	})
	require.NoError(t, err)
}
