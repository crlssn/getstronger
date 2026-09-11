package migrations_test

import (
	"context"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
)

// The fixture covers the shapes of pre-migration data the backfill must
// handle: a lone first word, two users sharing a first word, and a name whose
// first word carries characters a username may not.
const fixture038 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000201', 'username-one@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000202', 'username-two@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000203', 'username-three@getstronger.test', ''::bytea),
       ('aaaaaaaa-0000-4000-8000-000000000204', 'username-four@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name)
VALUES ('bbbbbbbb-0000-4000-8000-000000000201', 'aaaaaaaa-0000-4000-8000-000000000201', 'Alex Morgan'),
       ('bbbbbbbb-0000-4000-8000-000000000202', 'aaaaaaaa-0000-4000-8000-000000000202', 'Alex Taylor'),
       ('bbbbbbbb-0000-4000-8000-000000000203', 'aaaaaaaa-0000-4000-8000-000000000203', 'Jane Doe'),
       ('bbbbbbbb-0000-4000-8000-000000000204', 'aaaaaaaa-0000-4000-8000-000000000204', $$O'Brien Smith$$);
`

func TestMigration038BackfillsUsernames(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	db := runMigration(t, "038", "037_zz_username_fixture.sql", fixture038)

	usernameOf := func(userID string) string {
		var username string
		require.NoError(t, db.QueryRowContext(ctx, `
			SELECT username FROM public.users WHERE id = $1`, userID).Scan(&username))
		return username
	}

	// The first holder of a first word keeps it bare; the next gets a numeric
	// suffix. The fixture's insertion order decides who came first.
	require.Equal(t, "alex", usernameOf("bbbbbbbb-0000-4000-8000-000000000201"))
	require.Equal(t, "alex2", usernameOf("bbbbbbbb-0000-4000-8000-000000000202"))
	require.Equal(t, "jane", usernameOf("bbbbbbbb-0000-4000-8000-000000000203"))

	// Characters a username may not contain are stripped from the first word.
	require.Equal(t, "obrien", usernameOf("bbbbbbbb-0000-4000-8000-000000000204"))

	// The column rejects a duplicate regardless of case.
	_, err := db.ExecContext(ctx, `
		INSERT INTO public.auth (id, email, password)
		VALUES ('aaaaaaaa-0000-4000-8000-000000000205', 'username-five@getstronger.test', ''::bytea)`)
	require.NoError(t, err)
	_, err = db.ExecContext(ctx, `
		INSERT INTO public.users (id, auth_id, name, username)
		VALUES ('bbbbbbbb-0000-4000-8000-000000000205', 'aaaaaaaa-0000-4000-8000-000000000205', 'Alex Case', 'ALEX')`)
	require.ErrorContains(t, err, "idx_users_username_lower")
}
