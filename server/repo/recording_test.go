package repo_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/objectstore"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/testing/objectstoretest"
)

// What an unreachable bucket answers with in these tests.
var errBucketUnreachable = errors.New("bucket unreachable")

const recordedSession = `{"version":1,"points":[{"timestamp":1,"latitude":59.3,"longitude":18.0}]}`

// A saved recording leaves the row carrying a key and nothing else: the point
// of the move is that Postgres stops holding the document.
func (s *repoSuite) TestCreateWorkoutStoresItsRecordingAsAnObject() {
	ctx := context.Background()
	user := s.factory.NewUser()
	press := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	recording, err := s.repo.PutRecording(ctx, recordedSession)
	s.Require().NoError(err)
	s.Require().False(recording.WorkoutID.IsNil())

	workout, err := s.repo.CreateWorkout(ctx, repo.CreateWorkoutParams{
		Name:       "Run",
		UserID:     user.ID,
		StartedAt:  time.Now(),
		FinishedAt: time.Now().Add(time.Hour),
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: press.ID, Sets: []repo.Set{{Reps: 1, Weight: 1}}},
		},
		Recording: recording,
	})
	s.Require().NoError(err)

	// The workout is saved under the id its recording was written for, so the
	// key on the row and the object in the bucket are the same document.
	s.Require().Equal(recording.WorkoutID, workout.ID)

	row, err := models.Workouts.Query(
		models.SelectWhere.Workouts.ID.EQ(workout.ID),
	).One(ctx, bob.NewDB(s.container.DB))
	s.Require().NoError(err)
	s.Require().Empty(row.RecordingJSON)
	s.Require().Equal(repo.RecordingKey(workout.ID), row.RecordingKey)
	s.Require().Equal([]string{repo.RecordingKey(workout.ID)}, s.recordings.Keys())

	// And reading it back answers with the recording, wherever it is kept.
	read, err := s.repo.GetWorkout(ctx, repo.GetWorkoutWithID(workout.ID))
	s.Require().NoError(err)
	s.Require().JSONEq(recordedSession, read.RecordingJSON)
}

// A workout logged by hand carries no recording and needs no object.
func (s *repoSuite) TestCreateWorkoutWithoutARecordingWritesNoObject() {
	ctx := context.Background()
	user := s.factory.NewUser()
	press := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	recording, err := s.repo.PutRecording(ctx, "")
	s.Require().NoError(err)
	s.Require().Equal(repo.Recording{}, recording)

	before := len(s.recordings.Keys())
	workout, err := s.repo.CreateWorkout(ctx, repo.CreateWorkoutParams{
		Name:       "Push",
		UserID:     user.ID,
		StartedAt:  time.Now(),
		FinishedAt: time.Now().Add(time.Hour),
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: press.ID, Sets: []repo.Set{{Reps: 8, Weight: 60}}},
		},
		Recording: recording,
	})
	s.Require().NoError(err)
	s.Require().Len(s.recordings.Keys(), before)

	read, err := s.repo.GetWorkout(ctx, repo.GetWorkoutWithID(workout.ID))
	s.Require().NoError(err)
	s.Require().Empty(read.RecordingJSON)
}

// Every recording saved before this change is still on its row, and opening
// one must not depend on an object nobody has written yet.
func (s *repoSuite) TestReadsAnswerWithARecordingLeftOnTheRow() {
	ctx := context.Background()
	user := s.factory.NewUser()
	onRow := s.factory.NewWorkout(
		factory.WorkoutUserID(user.ID),
		factory.WorkoutRecordingJSON(recordedSession),
	)

	read, err := s.repo.GetWorkout(ctx, repo.GetWorkoutWithID(onRow.ID))
	s.Require().NoError(err)
	s.Require().JSONEq(recordedSession, read.RecordingJSON)
}

// One page of the feed holds sessions of both shapes and of neither, and each
// of them reads back as what it is.
func (s *repoSuite) TestListWorkoutsFillsBothShapesOfRecording() {
	ctx := context.Background()
	user := s.factory.NewUser()

	stored := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
	key := repo.RecordingKey(stored.ID)
	s.Require().NoError(s.recordings.Put(ctx, key, []byte(recordedSession)))
	stored = s.factory.NewWorkout(
		factory.WorkoutID(stored.ID),
		factory.WorkoutUserID(user.ID),
		factory.WorkoutRecordingKey(key),
	)

	onRow := s.factory.NewWorkout(
		factory.WorkoutUserID(user.ID),
		factory.WorkoutRecordingJSON(`{"version":1,"legacy":true}`),
	)
	byHand := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))

	workouts, err := s.repo.ListWorkouts(ctx, repo.ListWorkoutsWithUserIDs(user.ID))
	s.Require().NoError(err)

	recordings := make(map[uuid.UUID]string, len(workouts))
	for _, workout := range workouts {
		recordings[workout.ID] = workout.RecordingJSON
	}
	s.Require().JSONEq(recordedSession, recordings[stored.ID])
	s.Require().JSONEq(`{"version":1,"legacy":true}`, recordings[onRow.ID])
	s.Require().Empty(recordings[byHand.ID])
}

// A key that points at nothing is a lost document rather than a session logged
// by hand, so the read says so instead of drawing an empty route.
func (s *repoSuite) TestGetWorkoutReportsARecordingThatIsGone() {
	workout := s.factory.NewWorkout(
		factory.WorkoutRecordingKey("recordings/never-written.json"),
	)

	_, err := s.repo.GetWorkout(context.Background(), repo.GetWorkoutWithID(workout.ID))
	s.Require().ErrorIs(err, objectstore.ErrObjectNotFound)
}

// The pace reference is the last or the fastest recorded session of a routine,
// and a session is recorded whichever shape its recording is kept in.
func (s *repoSuite) TestRecordedWorkoutReadsFindAStoredRecording() {
	ctx := context.Background()
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	workout := s.factory.NewWorkout(
		factory.WorkoutUserID(user.ID),
		factory.WorkoutRoutineID(routine.ID),
	)
	key := repo.RecordingKey(workout.ID)
	s.Require().NoError(s.recordings.Put(ctx, key, []byte(recordedSession)))
	s.factory.NewWorkout(
		factory.WorkoutID(workout.ID),
		factory.WorkoutUserID(user.ID),
		factory.WorkoutRoutineID(routine.ID),
		factory.WorkoutRecordingKey(key),
	)
	s.factory.NewSet(
		factory.SetWorkoutID(workout.ID),
		factory.SetUserID(user.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetDistance(5),
		factory.SetDurationSeconds(1500),
	)

	last, err := s.repo.GetLastRecordedWorkout(ctx, user.ID, routine.ID)
	s.Require().NoError(err)
	s.Require().Equal(workout.ID, last.ID)
	s.Require().JSONEq(recordedSession, last.RecordingJSON)

	fastest, err := s.repo.GetFastestRecordedWorkout(ctx, user.ID, routine.ID)
	s.Require().NoError(err)
	s.Require().Equal(workout.ID, fastest.ID)
	s.Require().JSONEq(recordedSession, fastest.RecordingJSON)
}

// A bucket that will not take the document fails the save before the database
// has been asked for anything, which is what lets the client retry it.
func TestPutRecordingReportsAnUnreachableStore(t *testing.T) {
	t.Parallel()

	store := objectstoretest.NewMemory()
	store.PutErr = errBucketUnreachable

	_, err := repo.New(nil, store).PutRecording(context.Background(), recordedSession)
	require.ErrorIs(t, err, store.PutErr)
}
