package migrations_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

// The fixture recreates the states a hard-deleted routine left behind: a plan
// whose rotation lost its first routine while pointing at the second, one
// pointing past the end of what is left, one left with no routines at all, and
// an untouched plan that must not move.
const fixture050 = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0050-4000-8000-000000000001', 'positions@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name, username)
VALUES ('bbbbbbbb-0050-4000-8000-000000000001', 'aaaaaaaa-0050-4000-8000-000000000001', 'Pos Repair', 'posrepair');

-- A second athlete, because only one plan per athlete may be active and two of
-- these plans need to be.
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0050-4000-8000-000000000002', 'positions2@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name, username)
VALUES ('bbbbbbbb-0050-4000-8000-000000000002', 'aaaaaaaa-0050-4000-8000-000000000002', 'Pos Keep', 'poskeep');

INSERT INTO public.routines (id, user_id, title)
VALUES
    ('cccccccc-0050-4000-8000-000000000001', 'bbbbbbbb-0050-4000-8000-000000000001', 'First'),
    ('cccccccc-0050-4000-8000-000000000002', 'bbbbbbbb-0050-4000-8000-000000000001', 'Second'),
    ('cccccccc-0050-4000-8000-000000000003', 'bbbbbbbb-0050-4000-8000-000000000001', 'Third');

INSERT INTO public.plans (id, user_id, name, active, current_position)
VALUES
    ('dddddddd-0050-4000-8000-000000000001', 'bbbbbbbb-0050-4000-8000-000000000002', 'Gapped', TRUE, 1),
    ('dddddddd-0050-4000-8000-000000000002', 'bbbbbbbb-0050-4000-8000-000000000001', 'Stranded', FALSE, 2),
    ('dddddddd-0050-4000-8000-000000000003', 'bbbbbbbb-0050-4000-8000-000000000001', 'Emptied', TRUE, 0),
    ('dddddddd-0050-4000-8000-000000000004', 'bbbbbbbb-0050-4000-8000-000000000001', 'Intact', FALSE, 1);

-- 'Gapped' and 'Stranded' lost the routine that held position 0.
INSERT INTO public.plan_routines (plan_id, routine_id, position)
VALUES
    ('dddddddd-0050-4000-8000-000000000001', 'cccccccc-0050-4000-8000-000000000002', 1),
    ('dddddddd-0050-4000-8000-000000000001', 'cccccccc-0050-4000-8000-000000000003', 2),
    ('dddddddd-0050-4000-8000-000000000002', 'cccccccc-0050-4000-8000-000000000002', 1),
    ('dddddddd-0050-4000-8000-000000000002', 'cccccccc-0050-4000-8000-000000000003', 2),
    ('dddddddd-0050-4000-8000-000000000004', 'cccccccc-0050-4000-8000-000000000001', 0),
    ('dddddddd-0050-4000-8000-000000000004', 'cccccccc-0050-4000-8000-000000000002', 1);

-- 'Emptied' lost every routine it had, and is still its athlete's active plan.
`

func TestMigration050RepairsPlanPositions(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	fixturePath := filepath.Join(t.TempDir(), "049_zz_plan_positions_fixture.sql")
	require.NoError(t, os.WriteFile(fixturePath, []byte(fixture050), 0o600))

	scripts := migrationsThrough(t, "050")
	scripts = append(scripts[:len(scripts)-1], fixturePath, scripts[len(scripts)-1])

	container, err := postgres.Run(
		ctx, "postgres:16.4-alpine",
		postgres.WithInitScripts(scripts...),
		postgres.WithDatabase("test-db"),
		postgres.WithUsername("postgres"),
		postgres.WithPassword("postgres"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(time.Minute),
		),
	)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, container.Terminate(ctx)) })

	connection, err := container.ConnectionString(ctx, "sslmode=disable")
	require.NoError(t, err)

	db, err := sql.Open("pgx", connection)
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, db.Close()) })

	positionsOf := func(planID string) []int {
		rows, err := db.QueryContext(ctx,
			`SELECT position FROM public.plan_routines WHERE plan_id = $1 ORDER BY position`, planID)
		require.NoError(t, err)
		defer func() { require.NoError(t, rows.Close()) }()

		var positions []int
		for rows.Next() {
			var position int
			require.NoError(t, rows.Scan(&position))
			positions = append(positions, position)
		}
		require.NoError(t, rows.Err())
		return positions
	}

	planState := func(planID string) (int, bool) {
		var current int
		var active bool
		require.NoError(t, db.QueryRowContext(ctx,
			`SELECT current_position, active FROM public.plans WHERE id = $1`, planID).Scan(&current, &active))
		return current, active
	}

	// The gap is packed out, and a position still inside the rotation stays
	// where it is: the plan was on the second routine and remains on it.
	require.Equal(t, []int{0, 1}, positionsOf("dddddddd-0050-4000-8000-000000000001"))
	current, active := planState("dddddddd-0050-4000-8000-000000000001")
	require.Equal(t, 1, current)
	require.True(t, active, "a plan with routines left keeps following them")

	// A position past the end of what is left starts the rotation again.
	require.Equal(t, []int{0, 1}, positionsOf("dddddddd-0050-4000-8000-000000000002"))
	current, _ = planState("dddddddd-0050-4000-8000-000000000002")
	require.Zero(t, current)

	// A plan with nothing to train can no longer be the active one.
	require.Empty(t, positionsOf("dddddddd-0050-4000-8000-000000000003"))
	current, active = planState("dddddddd-0050-4000-8000-000000000003")
	require.Zero(t, current)
	require.False(t, active)

	// A rotation that never lost a routine is left alone.
	require.Equal(t, []int{0, 1}, positionsOf("dddddddd-0050-4000-8000-000000000004"))
	current, _ = planState("dddddddd-0050-4000-8000-000000000004")
	require.Equal(t, 1, current)
}
