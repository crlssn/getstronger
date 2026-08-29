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

func TestPasswordResetResendAllowed(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)

	// A token's deadline dates the email that carried it, so the argument is
	// the moment it was sent plus the token's lifetime.
	sentAt := func(d time.Duration) time.Time {
		return now.Add(d).Add(account.PasswordResetTokenTTL)
	}

	// Never asked, or asked and spent: no live token to date an email by.
	require.True(t, account.PasswordResetResendAllowed(time.Time{}, now))

	require.False(t, account.PasswordResetResendAllowed(sentAt(0), now))
	require.False(t, account.PasswordResetResendAllowed(sentAt(-account.PasswordResetCooldown/2), now))
	require.True(t, account.PasswordResetResendAllowed(sentAt(-account.PasswordResetCooldown), now))
	require.True(t, account.PasswordResetResendAllowed(sentAt(-time.Hour), now))
}

// An expired token still dates the email that carried it, but the cooldown ran
// out long before the token did, so a fresh link is never withheld.
func TestPasswordResetResendAllowedAfterTheTokenExpired(t *testing.T) {
	t.Parallel()

	now := time.Date(2026, time.August, 22, 12, 0, 0, 0, time.UTC)
	expired := now.Add(-time.Hour)

	require.True(t, account.PasswordResetTokenExpired(expired, now))
	require.True(t, account.PasswordResetResendAllowed(expired, now))
}
