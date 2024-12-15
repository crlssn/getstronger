package email

import "context"

type noop struct{}

func NewNoop() Email {
	return &noop{}
}

func (n *noop) SendVerificationEmail(_ context.Context, _ SendVerificationEmail) error {
	return nil
}

func (n *noop) SendPasswordResetEmail(_ context.Context, _ SendPasswordResetEmail) error {
	return nil
}

var _ Email = (*noop)(nil)
