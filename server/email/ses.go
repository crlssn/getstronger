package email

import (
	"context"
	"fmt"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/ses"
	"github.com/aws/aws-sdk-go-v2/service/ses/types"

	c "github.com/crlssn/getstronger/server/config"
)

type email struct {
	client *ses.Client
	config *c.Config
}

var _ Email = (*email)(nil)

const timeout = 5 * time.Second

func NewSES(c *c.Config) (Email, error) {
	ctx, cancelFuc := context.WithTimeout(context.Background(), timeout)
	defer cancelFuc()

	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion("eu-west-2"))
	if err != nil {
		return nil, fmt.Errorf("failed to load configuration: %w", err)
	}

	return &email{
		client: ses.NewFromConfig(cfg),
		config: c,
	}, nil
}

func MustNewSES(c *c.Config) Email {
	e, err := NewSES(c)
	if err != nil {
		panic(err)
	}

	return e
}

type SendVerification struct {
	Name  string
	Email string
	Token string
}

func (e *email) SendVerification(ctx context.Context, req SendVerification) error {
	sender := "noreply@getstronger.pro"
	subject := "[GetStronger] Verify your email"
	body := fmt.Sprintf(`Hi %s, 
	
Please verify your email address by clicking on the link below.

%s/verify-email?token=%s
`, req.Name, e.config.Server.AllowedOrigins[0], req.Token)

	if _, err := e.client.SendEmail(ctx, &ses.SendEmailInput{
		Source: aws.String(sender),
		Destination: &types.Destination{
			ToAddresses: []string{req.Email},
		},
		Message: &types.Message{
			Body: &types.Body{
				Text: &types.Content{
					Data: aws.String(body),
				},
			},
			Subject: &types.Content{
				Data: aws.String(subject),
			},
		},
	}); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

type SendPasswordReset struct {
	Name  string
	Email string
	Token string
}

func (e *email) SendPasswordReset(ctx context.Context, req SendPasswordReset) error {
	sender := "noreply@getstronger.pro"
	subject := "[GetStronger] Reset your password"
	body := fmt.Sprintf(`Hi %s, 
	
Please click the link below to reset your password.

%s/reset-password?token=%s
`, req.Name, e.config.Server.AllowedOrigins[0], req.Token)

	if _, err := e.client.SendEmail(ctx, &ses.SendEmailInput{
		Source: aws.String(sender),
		Destination: &types.Destination{
			ToAddresses: []string{req.Email},
		},
		Message: &types.Message{
			Body: &types.Body{
				Text: &types.Content{
					Data: aws.String(body),
				},
			},
			Subject: &types.Content{
				Data: aws.String(subject),
			},
		},
	}); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}
