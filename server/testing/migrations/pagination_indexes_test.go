package migrations_test

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

const (
	paginationUserID     = "bbbbbbbb-0000-4000-8000-000000000051"
	paginationExerciseID = "00000000-0000-4000-8000-000000000051"
	// Seeded past the point where reading the table beats reading an index, so
	// the plan the planner picks here is the one it picks in production. At this
	// size the ordered index scan costs 3.2 against 23.8 for the sort it
	// replaces, so the choice does not turn on a rounding difference.
	seededWorkouts = 400
	pageSize       = 21
)

// One athlete with a long history of one lift: a workout an hour for as far
// back as the count reaches, each with a set of the same exercise. It seeds
// both lists at once.
const fixturePaginationHistory = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0000-4000-8000-000000000051', 'pagination@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name, username)
VALUES ('bbbbbbbb-0000-4000-8000-000000000051', 'aaaaaaaa-0000-4000-8000-000000000051', 'Paige', 'paige');

INSERT INTO public.exercises (id, user_id, title)
VALUES ('00000000-0000-4000-8000-000000000051', 'bbbbbbbb-0000-4000-8000-000000000051', 'Bench press');

INSERT INTO public.workouts (id, user_id, name, started_at, finished_at, created_at)
SELECT uuid_generate_v4(),
       'bbbbbbbb-0000-4000-8000-000000000051',
       'Session ' || g,
       NOW() - (g || ' hours')::interval,
       NOW() - (g || ' hours')::interval,
       NOW() - (g || ' hours')::interval
FROM generate_series(1, %d) g;

INSERT INTO public.sets (workout_id, exercise_id, user_id, weight, reps, created_at)
SELECT w.id,
       '00000000-0000-4000-8000-000000000051',
       w.user_id,
       100,
       5,
       w.created_at
FROM public.workouts w
WHERE w.user_id = 'bbbbbbbb-0000-4000-8000-000000000051';

ANALYZE public.sets, public.workouts;
`

// TestPaginatedListsReadInIndexOrder holds the schema to the rule that a page
// of a newest-first list is read in index order rather than sorted. A list
// whose filter column is indexed on its own still reads every row behind the
// filter to hand back twenty, so opening the first page costs what the whole
// history costs — which looks fast until someone has trained for a year.
func TestPaginatedListsReadInIndexOrder(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	// The statistics have to describe the rows just written rather than the
	// empty table they were gathered on, so the fixture analyses as it ends.
	_, err := c.DB.ExecContext(ctx, fmt.Sprintf(fixturePaginationHistory, seededWorkouts))
	require.NoError(t, err)

	// The two queries are the ones the repository builds for these lists, down
	// to the tie-breaking ID that keeps the order total.
	for _, tt := range []struct {
		name  string
		query string
		arg   string
	}{
		{
			name: "sets of an exercise",
			query: `SELECT "sets"."id" FROM "sets" WHERE ("sets"."exercise_id" IN ($1)) ` +
				`ORDER BY "sets"."created_at" DESC, "sets"."id" DESC LIMIT ` + fmt.Sprint(pageSize),
			arg: paginationExerciseID,
		},
		{
			name: "workouts of an athlete",
			query: `SELECT "workouts"."id" FROM "workouts" WHERE ("workouts"."user_id" IN ($1)) ` +
				`ORDER BY "workouts"."created_at" DESC, "workouts"."id" DESC LIMIT ` + fmt.Sprint(pageSize),
			arg: paginationUserID,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			plan := explain(ctx, t, c.DB, tt.query, tt.arg)
			require.NotContains(t, plan, "Sort",
				"the page is sorted rather than read in index order:\n%s", plan)
		})
	}
}

func explain(ctx context.Context, t *testing.T, db *sql.DB, query, arg string) string {
	t.Helper()

	rows, err := db.QueryContext(ctx, `EXPLAIN `+query, arg)
	require.NoError(t, err)
	defer func() { _ = rows.Close() }()

	var plan strings.Builder
	for rows.Next() {
		var line string
		require.NoError(t, rows.Scan(&line))
		plan.WriteString(line)
		plan.WriteString("\n")
	}
	require.NoError(t, rows.Err())

	return plan.String()
}
