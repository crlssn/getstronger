package repo_test

import (
	"context"
	"database/sql"
	"log"
	"sync/atomic"
	"testing"

	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/training"
)

func TestPlanLifecycle(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testContainer := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := testContainer.Terminate(ctx); err != nil {
			log.Printf("terminate plan test container: %v", err)
		}
	})

	f := factory.NewFactory(testContainer.DB)
	r := repo.New(testContainer.DB)
	user := f.NewUser()
	lower := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Lower"))
	chest := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Chest"))
	pull := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Pull"))

	plan, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Strength Rotation",
		RoutineIDs: []uuid.UUID{lower.ID, chest.ID, pull.ID},
	})
	require.NoError(t, err)
	require.False(t, plan.Active)
	require.Equal(t, []uuid.UUID{lower.ID, chest.ID, pull.ID}, planRoutineIDs(plan))

	plan, err = r.SetActivePlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	require.True(t, plan.Active)
	require.Zero(t, plan.CurrentPosition)

	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, lower.ID)
	require.NoError(t, err)
	require.Equal(t, 1, plan.CurrentPosition)

	plan, err = r.UpdatePlan(ctx, repo.UpdatePlanParams{
		ID:         plan.ID,
		UserID:     user.ID,
		Name:       "Updated Rotation",
		RoutineIDs: []uuid.UUID{pull.ID, chest.ID, lower.ID},
	})
	require.NoError(t, err)
	require.Equal(t, "Updated Rotation", plan.Name)
	require.Equal(t, 1, plan.CurrentPosition, "the current Chest routine should remain current")

	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, chest.ID)
	require.NoError(t, err)
	require.Equal(t, 2, plan.CurrentPosition)
	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, lower.ID)
	require.NoError(t, err)
	require.Zero(t, plan.CurrentPosition, "the sequence should repeat indefinitely")

	require.NoError(t, r.PauseActivePlan(ctx, user.ID))
	_, err = r.GetActivePlan(ctx, user.ID)
	require.Error(t, err)
}

// TestPlanReadRoundTrips holds a plan read to a fixed number of queries: one
// for the plan rows, one for the rotations they name, and one apiece for the
// routines and their exercises. Reading a routine at a time made it grow with
// the rotation, on the dashboard, which reads the active plan every load.
func TestPlanReadRoundTrips(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testContainer := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := testContainer.Terminate(ctx); err != nil {
			log.Printf("terminate plan round trip container: %v", err)
		}
	})

	f := factory.NewFactory(testContainer.DB)
	r := repo.New(testContainer.DB)
	user := f.NewUser()
	userID := user.ID

	routines := make([]*models.Routine, 0, 3)
	routineIDs := make([]uuid.UUID, 0, 3)
	exerciseIDs := make(map[uuid.UUID][]uuid.UUID, cap(routines))
	for range cap(routines) {
		routine := f.NewRoutine(factory.RoutineUserID(user.ID))
		first := f.NewExercise(factory.ExerciseUserID(user.ID))
		second := f.NewExercise(factory.ExerciseUserID(user.ID))
		f.AddRoutineExercise(routine, first, second)
		routines = append(routines, routine)
		routineIDs = append(routineIDs, routine.ID)
		exerciseIDs[routine.ID] = []uuid.UUID{first.ID, second.ID}
	}

	rotation := []uuid.UUID{routineIDs[2], routineIDs[0], routineIDs[1]}
	active, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID: userID, Name: "Rotation", RoutineIDs: rotation,
	})
	require.NoError(t, err)
	_, err = r.SetActivePlan(ctx, active.ID, userID)
	require.NoError(t, err)

	// A second plan sharing the rotation's routines: ListPlans batches across
	// every plan, and a routine two plans hold must reach both of them.
	_, err = r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID: userID, Name: "Deload", RoutineIDs: routineIDs,
	})
	require.NoError(t, err)

	queries, counted := countedRepo(t, testContainer.Connection)

	queries.Store(0)
	plan, err := counted.GetActivePlan(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, int64(4), queries.Load(), "GetActivePlan should not query per routine")
	require.Equal(t, rotation, planRoutineIDs(plan))
	for _, routine := range plan.Routines {
		require.Equal(t, exerciseIDs[routine.ID], routineExerciseIDs(routine),
			"loading every routine at once must keep each one's exercises in their own order")
	}

	queries.Store(0)
	plans, err := counted.ListPlans(ctx, userID)
	require.NoError(t, err)
	require.Equal(t, int64(4), queries.Load(), "ListPlans should not query per plan or per routine")
	require.Len(t, plans, 2)
	require.Equal(t, rotation, planRoutineIDs(plans[0]))
	require.Equal(t, routineIDs, planRoutineIDs(plans[1]))
}

// TestPlanRotationRejections pins the two rejections apart: reading the whole
// rotation at once must still tell a routine that does not exist from one that
// belongs to somebody else, which the handlers answer with different codes.
func TestPlanRotationRejections(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testContainer := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := testContainer.Terminate(ctx); err != nil {
			log.Printf("terminate plan rejection container: %v", err)
		}
	})

	f := factory.NewFactory(testContainer.DB)
	r := repo.New(testContainer.DB)
	user, stranger := f.NewUser(), f.NewUser()
	own := f.NewRoutine(factory.RoutineUserID(user.ID))
	theirs := f.NewRoutine(factory.RoutineUserID(stranger.ID))

	_, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Unknown",
		RoutineIDs: []uuid.UUID{own.ID, uuid.Must(uuid.NewV4())},
	})
	require.ErrorIs(t, err, sql.ErrNoRows)

	_, err = r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Not mine",
		RoutineIDs: []uuid.UUID{own.ID, theirs.ID},
	})
	require.ErrorIs(t, err, training.ErrPlanRoutineBelongsToAnotherUser)

	plan, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Mine",
		RoutineIDs: []uuid.UUID{own.ID},
	})
	require.NoError(t, err)

	_, err = r.UpdatePlan(ctx, repo.UpdatePlanParams{
		ID:         plan.ID,
		UserID:     user.ID,
		Name:       "Mine",
		RoutineIDs: []uuid.UUID{theirs.ID},
	})
	require.ErrorIs(t, err, training.ErrPlanRoutineBelongsToAnotherUser)
}

// countedRepo returns a repo whose every query bumps the returned counter.
func countedRepo(t *testing.T, connection string) (*atomic.Int64, *repo.Repo) {
	t.Helper()

	config, err := pgx.ParseConfig(connection)
	require.NoError(t, err)

	counter := new(atomic.Int64)
	config.Tracer = queryCounter{counter}

	db := sql.OpenDB(stdlib.GetConnector(*config))
	// One connection, opened before anything is counted, so that establishing
	// it cannot land in the middle of a measurement.
	db.SetMaxOpenConns(1)
	require.NoError(t, db.PingContext(context.Background()))
	t.Cleanup(func() {
		if err = db.Close(); err != nil {
			log.Printf("close counted database: %v", err)
		}
	})

	return counter, repo.New(db)
}

// queryCounter counts every query pgx sends, whatever issues it.
type queryCounter struct {
	count *atomic.Int64
}

func (q queryCounter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	q.count.Add(1)
	return ctx
}

func (queryCounter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}

func routineExerciseIDs(routine *models.Routine) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(routine.R.Exercises))
	for _, exercise := range routine.R.Exercises {
		ids = append(ids, exercise.ID)
	}
	return ids
}

func planRoutineIDs(plan *training.Plan) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(plan.Routines))
	for _, routine := range plan.Routines {
		ids = append(ids, routine.ID)
	}
	return ids
}

// A routine an athlete retires must leave every plan that trained it without
// moving the plan onto a routine it was not on. See training.Plan.RotationWithout.
func TestSoftDeleteRoutineLeavesPlansPointingWhereTheyWere(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	testContainer := container.NewContainer(ctx)
	t.Cleanup(func() {
		if err := testContainer.Terminate(ctx); err != nil {
			log.Printf("terminate routine deletion test container: %v", err)
		}
	})

	f := factory.NewFactory(testContainer.DB)
	r := repo.New(testContainer.DB)
	user := f.NewUser()
	lower := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Lower"))
	chest := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Chest"))
	pull := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Pull"))

	plan, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Strength Rotation",
		RoutineIDs: []uuid.UUID{lower.ID, chest.ID, pull.ID},
	})
	require.NoError(t, err)

	plan, err = r.SetActivePlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	plan, err = r.AdvancePlan(ctx, plan.ID, user.ID, lower.ID)
	require.NoError(t, err)
	require.Equal(t, chest.ID, plan.CurrentRoutine().ID)

	// A plan holding none of the retired routines, to show the delete reaches
	// only the rotations the routine was actually in.
	press := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Press"))
	squat := f.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineName("Squat"))
	untouched, err := r.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Other Rotation",
		RoutineIDs: []uuid.UUID{press.ID, squat.ID},
	})
	require.NoError(t, err)

	require.NoError(t, r.SoftDeleteRoutine(ctx, lower.ID))
	plan, err = r.GetPlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{chest.ID, pull.ID}, planRoutineIDs(plan))
	require.Equal(t, chest.ID, plan.CurrentRoutine().ID, "the plan was on Chest before Lower went")
	require.True(t, plan.Active)

	require.NoError(t, r.SoftDeleteRoutine(ctx, chest.ID))
	plan, err = r.GetPlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{pull.ID}, planRoutineIDs(plan))
	require.Equal(t, pull.ID, plan.CurrentRoutine().ID, "a rotation that loses its current routine starts again")
	require.True(t, plan.Active)

	require.NoError(t, r.SoftDeleteRoutine(ctx, pull.ID))
	plan, err = r.GetPlan(ctx, plan.ID, user.ID)
	require.NoError(t, err)
	require.Empty(t, planRoutineIDs(plan))
	require.Zero(t, plan.CurrentPosition)
	require.False(t, plan.Active, "a plan with nothing to train cannot say what is next")

	untouched, err = r.GetPlan(ctx, untouched.ID, user.ID)
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{press.ID, squat.ID}, planRoutineIDs(untouched),
		"a plan none of the retired routines were in keeps its rotation")
	require.Zero(t, untouched.CurrentPosition)

	// The routines are retired rather than erased, so the workouts that trained
	// them still point at a row.
	_, err = r.GetRoutine(ctx, repo.GetRoutineWithID(lower.ID))
	require.ErrorIs(t, err, sql.ErrNoRows)
	require.NoError(t, testContainer.DB.QueryRowContext(ctx,
		`SELECT 1 FROM public.routines WHERE id = $1 AND deleted_at IS NOT NULL`,
		lower.ID.String()).Scan(new(int)))

	// A routine already retired is not there to retire again.
	require.ErrorIs(t, r.SoftDeleteRoutine(ctx, lower.ID), sql.ErrNoRows)
}
