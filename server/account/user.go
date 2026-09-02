package account

import (
	"time"

	"github.com/gofrs/uuid/v5"
)

// Auth is how an athlete proves who they are: the address they sign in with,
// whether it has been confirmed, and the tokens issued against it. A token the
// account does not hold is empty, and a moment it has not reached is zero.
type Auth struct {
	ID            uuid.UUID
	Email         string
	EmailVerified bool
	EmailToken    uuid.UUID
	RefreshToken  string
	// PasswordResetTokenValidUntil is when the outstanding reset token
	// expires, or zero when none is outstanding.
	PasswordResetTokenValidUntil time.Time
	// EmailVerificationSentAt is when the last verification mail went out, or
	// zero when none has.
	EmailVerificationSentAt time.Time
	CreatedAt               time.Time

	// User is the athlete behind the account, when the read asked for it.
	User *User
}

// User is an athlete as the rest of the app sees them: who they are and the
// units they train in.
type User struct {
	ID           uuid.UUID
	AuthID       uuid.UUID
	Name         string
	Username     string
	WeightUnit   string
	DistanceUnit string
	AutofillSets bool
	CreatedAt    time.Time

	// Email is only filled in when the read loaded the account behind the
	// athlete: it is the account holder's to see and nobody else's.
	Email string
}
