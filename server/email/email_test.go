package email_test

import (
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
	
Please click the link below to reset your password.

domain/reset-password?token=token
`, email.BodySendPasswordReset("name", "domain", "token"))
}

func TestNew(t *testing.T) {
	t.Parallel()
	c := new(config.Config)

	c.Email.Provider = config.EmailProviderSES
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
