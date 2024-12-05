package email

import (
	"context"
	"testing"
)

func TestSendEmail(t *testing.T) {
	Send(context.Background(), "hello+1234@crlssn.com")
}
