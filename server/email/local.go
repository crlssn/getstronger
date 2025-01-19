package email

import (
	"context"
	"fmt"
	"net"
	"net/smtp"
)

type local struct {
	auth smtp.Auth
	host string
	port string
}

func NewLocal() Email {
	host := "localhost"
	port := "1025"

	return &local{
		auth: smtp.PlainAuth("", fromEmail, "", host),
		host: host,
		port: port,
	}
}

func (l *local) SendVerification(_ context.Context, req SendVerification) error {
	addr := net.JoinHostPort(l.host, l.port)
	body := bodySendVerification(req.Name, fmt.Sprintf("http://%s", addr), req.Token)

	if err := smtp.SendMail(addr, l.auth, fromEmail, []string{req.Email}, []byte(body)); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}

func (l *local) SendPasswordReset(_ context.Context, req SendPasswordReset) error {
	addr := net.JoinHostPort(l.host, l.port)
	body := bodySendPasswordReset(req.Name, fmt.Sprintf("http://%s", addr), req.Token)

	if err := smtp.SendMail(addr, l.auth, fromEmail, []string{req.Email}, []byte(body)); err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	return nil
}
