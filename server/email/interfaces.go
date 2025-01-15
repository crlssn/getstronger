package email

import "context"

//go:generate mockgen -package email -source=interfaces.go -destination=interfaces_mock.go Email
type Email interface {
	SendVerification(ctx context.Context, req SendVerification) error
	SendPasswordReset(ctx context.Context, req SendPasswordReset) error
}
