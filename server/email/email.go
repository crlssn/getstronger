package email

import (
	"context"
	"fmt"

	"github.com/crlssn/getstronger/server/config"
)

//go:generate mockgen -package email -source=email.go -destination=email_mock.go Email
type Email interface {
	SendVerification(ctx context.Context, req SendVerification) error
	SendPasswordReset(ctx context.Context, req SendPasswordReset) error
}

var ErrUnknownEmailProvider = fmt.Errorf("unknown email provider")

func New(c *config.Config) (Email, error) {
	switch c.Email.Provider {
	case config.EmailProviderSES:
		return NewSES(c)
	case config.EmailProviderNoop:
		return NewNoop(), nil
	case config.EmailProviderLocal:
		return NewLocal(c), nil
	default:
		return nil, fmt.Errorf("%w: %s", ErrUnknownEmailProvider, c.Email.Provider)
	}
}

const (
	fromEmail = "noreply@getstronger.pro"

	subjectSendVerification  = "[GetStronger] Verify your email"
	subjectSendPasswordReset = "[GetStronger] Reset your password" //nolint:gosec
)

func BodySendVerification(name, domain, token string) string {
	return fmt.Sprintf(`Hi %s, 
	
Please verify your email address by clicking on the link below.

%s/verify-email?token=%s
`, name, domain, token)
}

func BodySendPasswordReset(name, domain, token string) string {
	return fmt.Sprintf(`Hi %s, 
	
Please click the link below to reset your password.

%s/reset-password?token=%s
`, name, domain, token)
}
