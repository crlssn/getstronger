package account_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/account"
)

func TestNormalizeEmailAddress(t *testing.T) {
	t.Parallel()

	require.Equal(t, "athlete@example.com", account.NormalizeEmailAddress("\tAthlete @ Example.COM\n"))
}

func TestParseEmailAddress(t *testing.T) {
	t.Parallel()

	address, err := account.ParseEmailAddress("  Athlete @ Example.com ")
	require.NoError(t, err)
	require.Equal(t, "athlete@example.com", address)

	_, err = account.ParseEmailAddress("athlete.example.com")
	require.ErrorIs(t, err, account.ErrInvalidEmail)
}

func TestNormalizeUsername(t *testing.T) {
	t.Parallel()

	require.Equal(t, "athlete", account.NormalizeUsername("  Athlete "))
}

func TestConfirmPassword(t *testing.T) {
	t.Parallel()

	require.NoError(t, account.ConfirmPassword("secret", "secret"))
	require.ErrorIs(t, account.ConfirmPassword("secret", "Secret"), account.ErrPasswordConfirmationMismatch)
}

func TestVerificationResendAllowed(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)

	require.True(t, account.VerificationResendAllowed(time.Time{}, now))
	require.True(t, account.VerificationResendAllowed(now.Add(-account.VerificationCooldown), now))
	require.False(t, account.VerificationResendAllowed(now.Add(-account.VerificationCooldown/2), now))
}

func TestPasswordResetTokenExpired(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)

	require.False(t, account.PasswordResetTokenExpired(time.Time{}, now))
	require.False(t, account.PasswordResetTokenExpired(now.Add(time.Hour), now))
	require.True(t, account.PasswordResetTokenExpired(now.Add(-time.Hour), now))
}
