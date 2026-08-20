package email_test

import (
	"bufio"
	"context"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/email"
)

func TestLocalSendVerificationUsesTheConfiguredPort(t *testing.T) {
	t.Parallel()

	delivered := newFakeSMTP(t)

	c := new(config.Config)
	c.Email.Provider = config.EmailProviderLocal
	c.Email.SMTPPort = delivered.port
	c.Server.AllowedOrigins = []string{"http://localhost:20383"}

	provider, err := email.New(c)
	require.NoError(t, err)

	require.NoError(t, provider.SendVerification(context.Background(), email.SendVerification{
		Name:  "Alex",
		Email: "alex@example.com",
		Token: "token",
	}))

	message := delivered.await(t)
	require.Contains(t, message, "alex@example.com")
	require.Contains(t, message, "http://localhost:20383/verify-email?token=token")
}

func TestLocalSendPasswordResetUsesTheConfiguredPort(t *testing.T) {
	t.Parallel()

	delivered := newFakeSMTP(t)

	c := new(config.Config)
	c.Email.Provider = config.EmailProviderLocal
	c.Email.SMTPPort = delivered.port
	c.Server.AllowedOrigins = []string{"http://localhost:20383"}

	provider, err := email.New(c)
	require.NoError(t, err)

	require.NoError(t, provider.SendPasswordReset(context.Background(), email.SendPasswordReset{
		Name:  "Alex",
		Email: "alex@example.com",
		Token: "token",
	}))

	require.Contains(t, delivered.await(t), "http://localhost:20383/reset-password?token=token")
}

func TestLocalSendFailsWhenTheServerIsUnreachable(t *testing.T) {
	t.Parallel()

	// Claim a port and release it again so nothing is listening on it.
	var listenConfig net.ListenConfig
	listener, err := listenConfig.Listen(t.Context(), "tcp", "localhost:0")
	require.NoError(t, err)
	_, port, err := net.SplitHostPort(listener.Addr().String())
	require.NoError(t, err)
	require.NoError(t, listener.Close())

	c := new(config.Config)
	c.Email.Provider = config.EmailProviderLocal
	c.Email.SMTPPort = port
	c.Server.AllowedOrigins = []string{"http://localhost:20383"}

	provider, err := email.New(c)
	require.NoError(t, err)

	require.Error(t, provider.SendVerification(context.Background(), email.SendVerification{
		Name:  "Alex",
		Email: "alex@example.com",
		Token: "token",
	}))
	require.Error(t, provider.SendPasswordReset(context.Background(), email.SendPasswordReset{
		Name:  "Alex",
		Email: "alex@example.com",
		Token: "token",
	}))
}

// fakeSMTP is the smallest server the standard library's SMTP client will talk
// to. It stands in for MailHog so that the test can prove the provider dials
// the configured port rather than a hardcoded one.
type fakeSMTP struct {
	port     string
	messages chan string
}

func newFakeSMTP(t *testing.T) *fakeSMTP {
	t.Helper()

	var config net.ListenConfig
	listener, err := config.Listen(t.Context(), "tcp", "localhost:0")
	require.NoError(t, err)
	t.Cleanup(func() { _ = listener.Close() })

	_, port, err := net.SplitHostPort(listener.Addr().String())
	require.NoError(t, err)

	server := &fakeSMTP{port: port, messages: make(chan string, 1)}
	go server.accept(listener)

	return server
}

func (f *fakeSMTP) accept(listener net.Listener) {
	for {
		conn, err := listener.Accept()
		if err != nil {
			return
		}

		go f.serve(conn)
	}
}

func (f *fakeSMTP) serve(conn net.Conn) {
	defer func() { _ = conn.Close() }()

	reader := bufio.NewReader(conn)
	write := func(line string) { _, _ = conn.Write([]byte(line + "\r\n")) }
	write("220 localhost ESMTP fake")

	var body strings.Builder
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}

		switch command := strings.ToUpper(strings.TrimSpace(line)); {
		case strings.HasPrefix(command, "EHLO"), strings.HasPrefix(command, "HELO"):
			// MailHog advertises AUTH, and the client refuses to send its
			// credentials to a server that does not. STARTTLS is left out so
			// that the exchange stays in the clear.
			write("250-localhost")
			write("250 AUTH PLAIN")
		case strings.HasPrefix(command, "AUTH"):
			write("235 2.7.0 Authentication successful")
		case strings.HasPrefix(command, "MAIL FROM"), strings.HasPrefix(command, "RCPT TO"):
			write("250 OK")
		case command == "DATA":
			write("354 End data with <CR><LF>.<CR><LF>")
			f.readBody(reader, &body)
			write("250 OK")
			f.messages <- body.String()
		case command == "QUIT":
			write("221 Bye")
			return
		default:
			write("250 OK")
		}
	}
}

func (f *fakeSMTP) readBody(reader *bufio.Reader, body *strings.Builder) {
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}

		if strings.TrimSpace(line) == "." {
			return
		}

		body.WriteString(line)
	}
}

func (f *fakeSMTP) await(t *testing.T) string {
	t.Helper()

	select {
	case message := <-f.messages:
		return message
	case <-time.After(5 * time.Second):
		t.Fatal("no message delivered to the configured port")
		return ""
	}
}
