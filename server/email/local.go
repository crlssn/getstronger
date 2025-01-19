package email

import (
	"context"
	"fmt"
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
	body := bodySendVerification(req.Name, fmt.Sprintf("http://%s:%s", l.host, l.port), req.Token)
	return smtp.SendMail(fmt.Sprintf("%s:%s", l.host, l.port), l.auth, fromEmail, []string{req.Email}, []byte(body))
}

func (l *local) SendPasswordReset(_ context.Context, req SendPasswordReset) error {
	body := bodySendPasswordReset(req.Name, fmt.Sprintf("http://%s:%s", l.host, l.port), req.Token)
	return smtp.SendMail(fmt.Sprintf("%s:%s", l.host, l.port), l.auth, fromEmail, []string{req.Email}, []byte(body))
}
