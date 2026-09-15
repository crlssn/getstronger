package config_test

import (
	"strings"
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

func TestEnvironmentSeedable(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		environment config.Environment
		expected    bool
	}{
		{
			name:        "local_is_seedable",
			environment: config.EnvironmentLocal,
			expected:    true,
		},
		{
			name:        "beta_is_seedable",
			environment: config.EnvironmentBeta,
			expected:    true,
		},
		{
			name:        "production_is_never_seedable",
			environment: config.EnvironmentProduction,
			expected:    false,
		},
		{
			name:        "an_unset_environment_is_never_seedable",
			environment: "",
			expected:    false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, test.environment.Seedable())
		})
	}
}

func TestEnvironmentLocal(t *testing.T) {
	t.Parallel()

	require.True(t, config.EnvironmentLocal.Local())
	require.False(t, config.EnvironmentBeta.Local())
	require.False(t, config.EnvironmentProduction.Local())
	require.False(t, config.Environment("").Local())
}

func TestPprofEnabled(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		pprof    config.Pprof
		expected bool
	}{
		{
			name:     "an_unset_token_serves_no_profiles",
			pprof:    config.Pprof{},
			expected: false,
		},
		{
			name:     "a_guessable_token_serves_no_profiles",
			pprof:    config.Pprof{Token: "hunter2"},
			expected: false,
		},
		{
			name:     "a_token_one_byte_short_serves_no_profiles",
			pprof:    config.Pprof{Token: strings.Repeat("a", config.PprofTokenMinLength-1)},
			expected: false,
		},
		{
			name:     "a_long_enough_token_serves_profiles",
			pprof:    config.Pprof{Token: strings.Repeat("a", config.PprofTokenMinLength)},
			expected: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			require.Equal(t, test.expected, test.pprof.Enabled())
		})
	}
}

func TestNewReadsThePprofToken(t *testing.T) {
	token := strings.Repeat("f", config.PprofTokenMinLength)
	t.Setenv("PPROF_TOKEN", token)
	require.Equal(t, token, config.New().Pprof.Token)
}

func TestLogsEnabled(t *testing.T) {
	t.Parallel()

	require.False(t, config.Logs{}.Enabled())
	require.False(t, config.Logs{Endpoint: "https://eu.i.posthog.com/i/v1/logs"}.Enabled())
	require.True(t, config.Logs{Token: "phc_test"}.Enabled())
}

func TestLogsURL(t *testing.T) {
	t.Parallel()

	require.Equal(t, config.DefaultLogsEndpoint, config.Logs{}.URL())
	require.Equal(t, "http://127.0.0.1:1/i/v1/logs", config.Logs{Endpoint: "http://127.0.0.1:1/i/v1/logs"}.URL())
}

func TestNewReadsTheLogsToken(t *testing.T) {
	t.Setenv("POSTHOG_KEY", "phc_test")
	t.Setenv("POSTHOG_LOGS_ENDPOINT", "http://127.0.0.1:1/i/v1/logs")
	require.Equal(t, "phc_test", config.New().Logs.Token)
	require.Equal(t, "http://127.0.0.1:1/i/v1/logs", config.New().Logs.URL())
}
