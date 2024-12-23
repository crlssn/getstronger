package email

import "context"

type noop struct{}

func NewNoop() Email {
	return &noop{}
}

func (n *noop) SendVerification(_ context.Context, _ SendVerification) error {
	return nil
}

func (n *noop) SendPasswordReset(_ context.Context, _ SendPasswordReset) error {
	return nil
}

var _ Email = (*noop)(nil)
