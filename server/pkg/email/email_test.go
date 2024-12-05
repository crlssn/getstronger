package email

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

func TestSendEmail(t *testing.T) {
	t.Parallel()
	email := MustNew()

	err := email.SendVerificationEmail(context.Background(), &orm.Auth{Email: "hello+1234@crlssn.com"})
	require.NoError(t, err)
}
