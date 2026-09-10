package migrations_test

import (
	"context"
	"io"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
)

// The fixture's name places it after migration 042 and before 043.
const fixtureName043 = "042_zz_email_fixture.sql"

// Addresses predating the migration were stored however they were typed.
const fixture043 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000301', 'Alice@Example.com', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000302', 'bob@example.com', ''::bytea);
`

// Two rows that are one mailbox. The migration must not decide which of them
// survives, because merging or disabling one takes its workout history along.
const fixture043Colliding = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000311', 'Carol@Example.com', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000312', 'carol@example.com', ''::bytea);
`

func TestMigration043LowercasesEmails(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	db := runMigration(t, "043", fixtureName043, fixture043)

	emailOf := func(authID string) string {
		var email string
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT email FROM public.auth WHERE id = $1`, authID).Scan(&email))
		return email
	}

	require.Equal(t, "alice@example.com", emailOf("aaaaaaaa-0000-4000-8000-000000000301"))
	require.Equal(t, "bob@example.com", emailOf("aaaaaaaa-0000-4000-8000-000000000302"))

	// From here the column rejects a duplicate regardless of case, so one
	// mailbox can never hold two accounts again.
	_, err := db.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000303', 'ALICE@EXAMPLE.COM', ''::bytea)`)
	require.ErrorContains(t, err, "idx_auth_email_lower")
}

func TestMigration043StopsOnCaseVariantDuplicates(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	container, err := startMigration(t, "043", fixtureName043, fixture043Colliding)
	require.Error(t, err)

	// The start error only says the container exited; what refused it is in
	// the logs, and asserting on that is what tells the two apart.
	require.NotNil(t, container)
	logs, err := container.Logs(ctx)
	require.NoError(t, err)
	defer func() { require.NoError(t, logs.Close()) }()

	output, err := io.ReadAll(logs)
	require.NoError(t, err)
	require.Contains(t, string(output), "auth rows hold case-variant duplicates of: carol@example.com")
}
