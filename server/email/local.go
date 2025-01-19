package email

import (
	"context"
	"fmt"
	"net"
	"net/smtp"

	"github.com/crlssn/getstronger/server/config"
)

type local struct {
	auth   smtp.Auth
	host   string
	port   string
	config *config.Config
}

func NewLocal(c *config.Config) Email {
	host := "localhost"
	port := "1025"

	return &local{
		auth:   smtp.PlainAuth("", fromEmail, "", host),
		host:   host,
		port:   port,
		config: c,
	}
}

func (l *local) SendVerification(_ context.Context, req SendVerification) error {
	addr := net.JoinHostPort(l.host, l.port)
	body := bodySendVerification(req.Name, l.config.Server.AllowedOrigins[0], req.Token)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\n\n%s", fromEmail, req.ToEmail, subjectSendVerification, body)

	if err := smtp.SendMail(addr, l.auth, fromEmail, []string{req.ToEmail}, []byte(msg)); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

func (l *local) SendPasswordReset(_ context.Context, req SendPasswordReset) error {
	addr := net.JoinHostPort(l.host, l.port)
	body := bodySendPasswordReset(req.Name, l.config.Server.AllowedOrigins[0], req.Token)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\n\n%s", fromEmail, req.Email, subjectSendPasswordReset, body)

	if err := smtp.SendMail(addr, l.auth, fromEmail, []string{req.Email}, []byte(msg)); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}
