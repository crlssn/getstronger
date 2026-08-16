package config_test

import (
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/config"
)

func TestEmailSMTPAddr(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		email    config.Email
		expected string
	}{
		{
			name:     "defaults_to_the_local_mailhog",
			email:    config.Email{},
			expected: "localhost:1025",
		},
		{
			name:     "uses_the_configured_port",
			email:    config.Email{SMTPPort: "20387"},
			expected: "localhost:20387",
		},
		{
			name:     "uses_the_configured_host_and_port",
			email:    config.Email{SMTPHost: "mailhog", SMTPPort: "20387"},
			expected: "mailhog:20387",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, test.email.SMTPAddr())
		})
	}
}

func TestNewReadsTheSMTPPort(t *testing.T) {
	t.Setenv("MAILHOG_SMTP_PORT", "20387")
	require.Equal(t, "localhost:20387", config.New().Email.SMTPAddr())
}
