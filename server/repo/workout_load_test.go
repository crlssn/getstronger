package repo_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"sync/atomic"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"

	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/factory"
)

// A workout is read with its sets and their exercises, and its comments and
// their authors, one statement per relation. Bob appends every loader it is
// handed and the last one wins, so an option that loaded the sets without
// their exercises would let a caller fetch the sets twice by asking for the
// exercises separately: the feed and the dashboard once did.
func (s *repoSuite) TestGetWorkoutLoadsEachRelationOnce() {
	ctx := context.Background()
	r, statements := s.countingRepo()

	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
	s.factory.NewSetSlice(3, factory.SetUserID(user.ID), factory.SetWorkoutID(workout.ID), factory.SetExerciseID(exercise.ID))
	comment := s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID))
	s.factory.NewWorkoutLike(factory.WorkoutLikeWorkoutID(workout.ID))

	statements.Store(0)
	got, err := r.GetWorkout(
		ctx,
		repo.GetWorkoutWithID(workout.ID),
		repo.GetWorkoutLoadUser(),
		repo.GetWorkoutLoadSets(),
		repo.GetWorkoutLoadComments(),
		repo.GetWorkoutLoadLikes(),
	)
	s.Require().NoError(err)
	// The workout joined to its user, then the sets, the comments and the likes.
	s.Require().EqualValues(4, statements.Load())

	s.Require().Len(got.Sets, 3)
	for _, set := range got.Sets {
		s.Require().NotNil(set.Exercise)
		s.Require().Equal(exercise.ID, set.Exercise.ID)
	}
	s.Require().Len(got.Comments, 1)
	s.Require().NotNil(got.Comments[0].User)
	s.Require().Equal(comment.UserID, got.Comments[0].User.ID)
	s.Require().Len(got.Likes, 1)
}

func (s *repoSuite) TestListWorkoutsLoadsEachRelationOnce() {
	ctx := context.Background()
	r, statements := s.countingRepo()

	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	workouts := s.factory.NewWorkoutSlice(2, factory.WorkoutUserID(user.ID))
	for _, workout := range workouts {
		s.factory.NewSetSlice(2, factory.SetUserID(user.ID), factory.SetWorkoutID(workout.ID), factory.SetExerciseID(exercise.ID))
		s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID))
		s.factory.NewWorkoutLike(factory.WorkoutLikeWorkoutID(workout.ID))
	}

	statements.Store(0)
	got, err := r.ListWorkouts(
		ctx,
		repo.ListWorkoutsWithUserIDs(user.ID),
		repo.ListWorkoutsLoadUser(),
		repo.ListWorkoutsLoadSets(),
		repo.ListWorkoutsLoadComments(),
		repo.ListWorkoutsLoadLikes(),
	)
	s.Require().NoError(err)
	// The page joined to its users, then the sets, the comments and the likes
	// of the whole page.
	s.Require().EqualValues(4, statements.Load())

	s.Require().Len(got, 2)
	for _, workout := range got {
		s.Require().Len(workout.Sets, 2)
		for _, set := range workout.Sets {
			s.Require().NotNil(set.Exercise)
			s.Require().Equal(exercise.ID, set.Exercise.ID)
		}
		s.Require().Len(workout.Comments, 1)
		s.Require().Len(workout.Likes, 1)
	}
}

// countingRepo opens a second handle on the suite's database whose statements
// are counted, so a test can say what a read costs and not only what it
// returns.
func (s *repoSuite) countingRepo() (*repo.Repo, *atomic.Int64) {
	config, err := pgx.ParseConfig(s.container.Connection)
	s.Require().NoError(err)

	counter := &statementCounter{Connector: stdlib.GetConnector(*config)}
	db := sql.OpenDB(counter)
	s.T().Cleanup(func() { s.Require().NoError(db.Close()) })

	return repo.New(db, s.recordings), &counter.statements
}

var errNotPgxConn = errors.New("connection is not a pgx connection")

// statementCounter wraps the pgx connector so every connection it opens
// counts the statements sent through it.
type statementCounter struct {
	driver.Connector

	statements atomic.Int64
}

func (c *statementCounter) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := c.Connector.Connect(ctx)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	pgxConn, ok := conn.(*stdlib.Conn)
	if !ok {
		return nil, fmt.Errorf("%w: %T", errNotPgxConn, conn)
	}

	return &countingConn{Conn: pgxConn, statements: &c.statements}, nil
}

// countingConn counts each statement on its way to the driver. A prepare is
// counted as well, so database/sql falling back to the prepared path cannot
// hide a round trip.
type countingConn struct {
	*stdlib.Conn

	statements *atomic.Int64
}

func (c *countingConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.statements.Add(1)

	return c.Conn.QueryContext(ctx, query, args) //nolint:wrapcheck // A driver forwards its errors as they are.
}

func (c *countingConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	c.statements.Add(1)

	return c.Conn.ExecContext(ctx, query, args) //nolint:wrapcheck // A driver forwards its errors as they are.
}

func (c *countingConn) PrepareContext(ctx context.Context, query string) (driver.Stmt, error) {
	c.statements.Add(1)

	return c.Conn.PrepareContext(ctx, query) //nolint:wrapcheck // A driver forwards its errors as they are.
}
