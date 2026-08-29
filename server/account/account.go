// Package account is the identity bounded context: who an athlete is, how they
// prove it, and the rules that govern registering, verifying and recovering an
// account.
//
// The package owns that vocabulary and nothing else. Hashing, storage, mail
// delivery and RPC live outside it and call in.
package account

import (
	"errors"
	"strings"
	"time"
)

var (
	// ErrInvalidEmail reports an address that cannot belong to anybody.
	ErrInvalidEmail = errors.New("invalid email")
	// ErrEmailAlreadyRegistered reports an address that already has an account.
	ErrEmailAlreadyRegistered = errors.New("email already exists")
	// ErrUsernameTaken reports a username another athlete already answers to.
	ErrUsernameTaken = errors.New("username already exists")
	// ErrPasswordConfirmationMismatch reports a password typed twice, differently.
	ErrPasswordConfirmationMismatch = errors.New("passwords do not match")
)

// NormalizeEmailAddress folds an address to the form uniqueness and lookups are
// judged by: it strips the spaces people paste in around one, and lowercases
// the rest, because a mailbox is one mailbox however its address was typed.
func NormalizeEmailAddress(raw string) string {
	return strings.ToLower(strings.ReplaceAll(strings.TrimSpace(raw), " ", ""))
}

// ParseEmailAddress normalizes an address and rejects one that could never be
// delivered to. Anything beyond that is the mail server's judgement, not ours.
func ParseEmailAddress(raw string) (string, error) {
	address := NormalizeEmailAddress(raw)
	if !strings.Contains(address, "@") {
		return "", ErrInvalidEmail
	}

	return address, nil
}

// NormalizeUsername folds a username to the form uniqueness is judged by:
// athletes are the same person whatever case or padding they type.
func NormalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// ConfirmPassword checks that a password typed twice reads the same both times.
func ConfirmPassword(password, confirmation string) error {
	if password != confirmation {
		return ErrPasswordConfirmationMismatch
	}

	return nil
}

// VerificationCooldown is how long an address must wait between verification
// emails, so that the endpoint cannot be used to send somebody mail repeatedly.
const VerificationCooldown = time.Minute

// VerificationResendAllowed reports whether an address that was last sent a
// verification email at lastSentAt may be sent another one now. An address that
// has never been sent one always may.
func VerificationResendAllowed(lastSentAt, now time.Time) bool {
	if lastSentAt.IsZero() {
		return true
	}

	return now.Sub(lastSentAt) >= VerificationCooldown
}

// PasswordResetTokenTTL is how long a password reset link stays usable.
const PasswordResetTokenTTL = 24 * time.Hour

// PasswordResetTokenExpired reports whether a reset link has run out. A token
// with no expiry recorded predates the deadline and is honoured.
func PasswordResetTokenExpired(validUntil, now time.Time) bool {
	if validUntil.IsZero() {
		return false
	}

	return validUntil.Before(now)
}

// PasswordResetCooldown is how long an address must wait between password reset
// emails, so that the endpoint cannot be used to send somebody mail repeatedly.
const PasswordResetCooldown = time.Minute

// PasswordResetResendAllowed reports whether an address holding a reset token
// that runs out at validUntil may be sent another reset email now.
//
// The token's deadline dates the email that carried it: a reset always issues a
// token good for PasswordResetTokenTTL from the moment it sends, so the send
// time is that deadline less the lifetime and nothing separate records it. An
// address with no live token has either never asked or has spent the one it
// had, and always may.
func PasswordResetResendAllowed(validUntil, now time.Time) bool {
	if validUntil.IsZero() {
		return true
	}

	return now.Sub(validUntil.Add(-PasswordResetTokenTTL)) >= PasswordResetCooldown
}
