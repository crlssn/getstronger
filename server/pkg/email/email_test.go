//go:build external
// +build external

package email

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestSendEmail(t *testing.T) {
	t.Parallel()
	email := MustNew()

	err := email.SendVerificationEmail(context.Background(), SendVerificationEmail{
		Name:  "Christian",
		Email: "hello@crlssn.com",
		Token: "1234",
	})
	require.NoError(t, err)
}
