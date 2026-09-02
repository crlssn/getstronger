package migrations_test

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

const (
	// Seeded past the point where reading the table beats reading an index, so
	// the plan the planner picks here is the one it picks in production.
	seededWorkouts = 400
	pageSize       = 21
)

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

	f := factory.NewFactory(c.DB)
	user := f.NewUser()
	exercise := f.NewExercise(factory.ExerciseUserID(user.ID))

	// One set per workout on the one exercise, so a single loop seeds both
	// lists with the history of an athlete who has trained the same lift for a
	// long time.
	sets := make([][]factory.SetOpt, 0, seededWorkouts)
	for i := range seededWorkouts {
		createdAt := time.Now().UTC().Add(-time.Duration(i) * time.Hour)
		workout := f.NewWorkout(
			factory.WorkoutUserID(user.ID),
			factory.WorkoutCreatedAt(createdAt),
		)
		sets = append(sets, []factory.SetOpt{
			factory.SetUserID(user.ID),
			factory.SetWorkoutID(workout.ID),
			factory.SetExerciseID(exercise.ID),
			factory.SetCreatedAt(createdAt),
		})
	}
	f.NewSetBatch(sets...)

	// A plan is costed off the statistics, so they have to describe the rows
	// just written rather than the empty table they were gathered on.
	_, err := c.DB.ExecContext(ctx, `ANALYZE public.sets, public.workouts`)
	require.NoError(t, err)

	// The two queries are the ones the repository builds for these lists, down
	// to the tie-breaking ID that keeps the order total.
	for _, tt := range []struct {
		name  string
		query string
		arg   any
	}{
		{
			name: "sets of an exercise",
			query: `SELECT "sets"."id" FROM "sets" WHERE ("sets"."exercise_id" IN ($1)) ` +
				`ORDER BY "sets"."created_at" DESC, "sets"."id" DESC LIMIT ` + fmt.Sprint(pageSize),
			arg: exercise.ID,
		},
		{
			name: "workouts of an athlete",
			query: `SELECT "workouts"."id" FROM "workouts" WHERE ("workouts"."user_id" IN ($1)) ` +
				`ORDER BY "workouts"."created_at" DESC, "workouts"."id" DESC LIMIT ` + fmt.Sprint(pageSize),
			arg: user.ID,
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

func explain(ctx context.Context, t *testing.T, db *sql.DB, query string, arg any) string {
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
