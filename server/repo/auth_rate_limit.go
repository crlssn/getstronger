package repo

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/gofrs/uuid/v5"
)

// ConsumeAuthAttempt atomically reserves an attempt before expensive auth work.
// PostgreSQL owns the clock and row lock, so replicas share one fixed window.
// Refusals neither write the counter nor move its expiry.
func (r *Repo) ConsumeAuthAttempt(ctx context.Context, key string, limit int, window time.Duration) (bool, error) {
	const query = `
WITH expired AS (
    SELECT key FROM public.auth_rate_limits
    WHERE expires_at < statement_timestamp() AND key <> $1
    ORDER BY expires_at LIMIT 16 FOR UPDATE SKIP LOCKED
), reaped AS (
    DELETE FROM public.auth_rate_limits WHERE key IN (SELECT key FROM expired)
)
INSERT INTO public.auth_rate_limits AS limits (key, attempts, expires_at)
VALUES ($1, 1, statement_timestamp() + $3 * INTERVAL '1 second')
ON CONFLICT (key) DO UPDATE SET
    attempts = CASE WHEN limits.expires_at <= statement_timestamp() THEN 1 ELSE limits.attempts + 1 END,
    expires_at = CASE WHEN limits.expires_at <= statement_timestamp() THEN EXCLUDED.expires_at ELSE limits.expires_at END
WHERE limits.expires_at <= statement_timestamp() OR limits.attempts < $2
RETURNING true`
	var allowed bool
	err := r.sqlExec().QueryRowContext(ctx, query, key, limit, window.Seconds()).Scan(&allowed)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("consume auth attempt: %w", err)
	}
	return allowed, nil
}

// PasswordResetAccount identifies the account without validating or consuming its token.
// A rotated token still shares the account's password-update allowance.
func (r *Repo) PasswordResetAccount(ctx context.Context, token uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := r.sqlExec().QueryRowContext(ctx, "SELECT id FROM public.auth WHERE password_reset_token = $1", token).Scan(&id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("password reset account: %w", err)
	}
	return id, nil
}
