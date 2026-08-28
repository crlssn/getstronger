package email_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/email"
)

func TestBodySendVerification(t *testing.T) {
	t.Parallel()
	require.Equal(t, `Hi name, 
	
Please verify your email address by clicking on the link below.

domain/verify-email?token=token
`, email.BodySendVerification("name", "domain", "token"))
}

func TestBodySendPasswordReset(t *testing.T) {
	t.Parallel()
	require.Equal(t, `Hi name, 
	
Please click the link below within 24 hours to reset your password.

domain/reset-password?token=token
`, email.BodySendPasswordReset("name", "domain", "token"))
}

func TestNew(t *testing.T) {
	t.Parallel()
	c := new(config.Config)

	c.Email.Provider = config.EmailProviderScaleway
	c.Email.ScalewayProjectID = "project-id"
	c.Email.ScalewaySecretKey = "secret-key"
	c.Server.AllowedOrigins = []string{"https://example.com"}
	_, err := email.New(c)
	require.NoError(t, err)

	c.Email.Provider = config.EmailProviderNoop
	_, err = email.New(c)
	require.NoError(t, err)

	c.Email.Provider = config.EmailProviderLocal
	_, err = email.New(c)
	require.NoError(t, err)

	c.Email.Provider = ""
	_, err = email.New(c)
	require.Error(t, err)
	require.ErrorIs(t, err, email.ErrUnknownEmailProvider)
}

// The no-op provider is what the local stack runs with when nothing should
// leave the machine: it accepts both messages and sends neither.
func TestNoopSendsNothing(t *testing.T) {
	t.Parallel()
	provider := email.NewNoop()

	require.NoError(t, provider.SendVerification(context.Background(), email.SendVerification{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	}))
	require.NoError(t, provider.SendPasswordReset(context.Background(), email.SendPasswordReset{
		Name:  "John Doe",
		Email: "john@example.com",
		Token: "token",
	}))
}
