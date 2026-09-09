package migrations_test

import (
	"context"
	"database/sql"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib" // Register pgx driver
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/testing/container"
)

// Two athletes, so the two orderings below cannot read each other's record.
const personalBestsFixture = `
INSERT INTO public.auth (id, email, password)
VALUES ('aaaaaaaa-0059-4000-8000-000000000001', 'races1@getstronger.test', ''::bytea),
       ('aaaaaaaa-0059-4000-8000-000000000002', 'races2@getstronger.test', ''::bytea);

INSERT INTO public.users (id, auth_id, name, username)
VALUES ('bbbbbbbb-0059-4000-8000-000000000001', 'aaaaaaaa-0059-4000-8000-000000000001', 'Race One', 'raceone'),
       ('bbbbbbbb-0059-4000-8000-000000000002', 'aaaaaaaa-0059-4000-8000-000000000002', 'Race Two', 'racetwo');

INSERT INTO public.exercises (id, user_id, title, metrics)
VALUES ('cccccccc-0059-4000-8000-000000000001', 'bbbbbbbb-0059-4000-8000-000000000001', 'Squat',
        ARRAY ['weight', 'reps']),
       ('cccccccc-0059-4000-8000-000000000002', 'bbbbbbbb-0059-4000-8000-000000000002', 'Squat',
        ARRAY ['weight', 'reps']);

INSERT INTO public.workouts (id, user_id, name, started_at, finished_at)
VALUES ('dddddddd-0059-4000-8000-000000000001', 'bbbbbbbb-0059-4000-8000-000000000001', 'One',
        now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
       ('dddddddd-0059-4000-8000-000000000002', 'bbbbbbbb-0059-4000-8000-000000000002', 'Two',
        now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC');
`

const insertSet = `
INSERT INTO public.sets (workout_id, exercise_id, user_id, weight, reps, position)
VALUES ($1, $2, $3, $4, 5, 0)`

const storedBest = `
SELECT s.weight
FROM public.personal_bests pb
         JOIN public.sets s ON s.id = pb.set_id
WHERE pb.exercise_id = $1`

// TestPersonalBestPromotionOutlastsAnOverlappingSave saves for one pair from
// two transactions at once, in both commit orders. Each reads the stored
// record in its own snapshot, so neither sees the other's promotion, and
// whichever wrote second used to own the record whatever it held: a 120 kg set
// replacing a 150 kg record, and staying there, since only a delete or an
// update re-reads the history.
//
// A serial save cannot show it. The second transaction has to be waiting on
// the first before that one commits, which is what waitsForLock pins down.
func TestPersonalBestPromotionOutlastsAnOverlappingSave(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(ctx)) })

	_, err := c.DB.ExecContext(ctx, personalBestsFixture)
	require.NoError(t, err)

	for _, tt := range []struct {
		name       string
		userID     string
		exerciseID string
		workoutID  string
		first      float64
		second     float64
	}{
		{
			name:       "record set first",
			userID:     "bbbbbbbb-0059-4000-8000-000000000001",
			exerciseID: "cccccccc-0059-4000-8000-000000000001",
			workoutID:  "dddddddd-0059-4000-8000-000000000001",
			first:      150,
			second:     120,
		},
		{
			name:       "record set second",
			userID:     "bbbbbbbb-0059-4000-8000-000000000002",
			exerciseID: "cccccccc-0059-4000-8000-000000000002",
			workoutID:  "dddddddd-0059-4000-8000-000000000002",
			first:      120,
			second:     150,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			first, err := c.DB.BeginTx(ctx, nil)
			require.NoError(t, err)
			second, err := c.DB.BeginTx(ctx, nil)
			require.NoError(t, err)

			_, err = first.ExecContext(ctx, insertSet, tt.workoutID, tt.exerciseID, tt.userID, tt.first)
			require.NoError(t, err)

			saved := make(chan error, 1)
			go func() {
				_, err := second.ExecContext(ctx, insertSet, tt.workoutID, tt.exerciseID, tt.userID, tt.second)
				saved <- err
			}()

			waitsForLock(ctx, t, c.DB)
			require.NoError(t, first.Commit())
			require.NoError(t, <-saved)
			require.NoError(t, second.Commit())

			var weight float64
			require.NoError(t, c.DB.QueryRowContext(ctx, storedBest, tt.exerciseID).Scan(&weight))
			require.InDelta(t, 150.0, weight, 0.001, "the record is the heaviest set logged")
		})
	}
}

// waitsForLock blocks until a backend is waiting on another one, which is the
// overlap the test is about: the second save has reached the promotion and the
// first has not committed it yet.
func waitsForLock(ctx context.Context, t *testing.T, db *sql.DB) {
	t.Helper()
	require.Eventually(t, func() bool {
		var waiting int
		if err := db.QueryRowContext(ctx,
			`SELECT count(*) FROM pg_stat_activity
			 WHERE wait_event_type = 'Lock' AND datname = current_database()`).Scan(&waiting); err != nil {
			return false
		}
		return waiting > 0
	}, 30*time.Second, 10*time.Millisecond, "the second save never waited on the first")
}
