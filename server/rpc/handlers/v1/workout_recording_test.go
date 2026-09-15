package v1_test

import (
	"context"
	"errors"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stephenafamo/bob"
	"go.uber.org/zap"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/crlssn/getstronger/server/gen/models"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

// What an unreachable bucket answers with in this test.
var errBucketUnreachable = errors.New("bucket unreachable")

// recordedSession is one interval with one fix in it, in the shape
// training.ValidateRecording accepts for a session run over the given span.
func recordedSession(startedAt, finishedAt time.Time) string {
	return fmt.Sprintf(
		`{"version":1,"startedAt":%d,"endedAt":%d,"phases":[{"exerciseId":"","stationKey":"run","name":"Run","round":1,"durationSeconds":60,"instruction":""}],"pauses":[],"points":[{"timestamp":%d,"latitude":59.3326,"longitude":18.0649,"accuracy":5,"speed":null}],"interrupted":false}`,
		startedAt.UnixMilli(), finishedAt.UnixMilli(), startedAt.UnixMilli()+1,
	)
}

// A saved recording is written to the object store and read back from it, so
// the route the athlete opens is the one they recorded.
func (s *workoutSuite) TestCreateWorkoutStoresTheRecordingOutsideTheRow() {
	ctx, user := s.recordingContext()
	startedAt := time.Now().UTC().Add(-time.Hour)
	finishedAt := time.Now().UTC()
	recording := recordedSession(startedAt, finishedAt)

	res, err := s.handler.CreateWorkout(ctx, connect.NewRequest(s.recordedRequest(user, startedAt, finishedAt, recording)))
	s.Require().NoError(err)

	workoutID := uuid.FromStringOrNil(res.Msg.GetWorkoutId())
	row, err := models.Workouts.Query(
		models.SelectWhere.Workouts.ID.EQ(workoutID),
	).One(ctx, bob.NewDB(s.container.DB))
	s.Require().NoError(err)
	s.Require().Empty(row.RecordingJSON)
	s.Require().Equal(repo.RecordingKey(workoutID), row.RecordingKey)

	read, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
		Id: res.Msg.GetWorkoutId(),
	}))
	s.Require().NoError(err)
	s.Require().JSONEq(recording, read.Msg.GetWorkout().GetRecordingJson())
}

// A bucket that will not take the recording fails the save outright rather
// than saving the session without its route. Nothing is written, so the queue
// replays the attempt under the same idempotency key and it lands whole.
func (s *workoutSuite) TestCreateWorkoutFailsWhenTheRecordingCannotBeStored() {
	ctx, user := s.recordingContext()
	startedAt := time.Now().UTC().Add(-time.Hour)
	finishedAt := time.Now().UTC()
	recording := recordedSession(startedAt, finishedAt)

	request := s.recordedRequest(user, startedAt, finishedAt, recording)
	idempotencyKey := uuid.Must(uuid.NewV4()).String()
	request.IdempotencyKey = &idempotencyKey

	s.recordings.PutErr = errBucketUnreachable
	_, err := s.handler.CreateWorkout(ctx, connect.NewRequest(request))
	s.Require().Equal(connect.CodeInternal, connect.CodeOf(err))

	count, err := models.Workouts.Query(
		models.SelectWhere.Workouts.UserID.EQ(user),
	).Count(ctx, bob.NewDB(s.container.DB))
	s.Require().NoError(err)
	s.Require().Zero(count)

	// The same attempt, replayed once the bucket is back.
	s.recordings.PutErr = nil
	res, err := s.handler.CreateWorkout(ctx, connect.NewRequest(request))
	s.Require().NoError(err)

	read, err := s.handler.GetWorkout(ctx, connect.NewRequest(&apiv1.GetWorkoutRequest{
		Id: res.Msg.GetWorkoutId(),
	}))
	s.Require().NoError(err)
	s.Require().JSONEq(recording, read.Msg.GetWorkout().GetRecordingJson())
}

// The recorder paces a new session against an old one, and reads it back from
// wherever that session's recording is kept.
func (s *workoutSuite) TestGetPaceReferenceReadsAStoredRecording() {
	ctx, user := s.recordingContext()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user))

	workout := s.factory.NewWorkout(
		factory.WorkoutUserID(user),
		factory.WorkoutRoutineID(routine.ID),
	)
	key := repo.RecordingKey(workout.ID)
	s.Require().NoError(s.recordings.Put(ctx, key, []byte(`{"stored":true}`)))
	s.factory.NewWorkout(
		factory.WorkoutID(workout.ID),
		factory.WorkoutUserID(user),
		factory.WorkoutRoutineID(routine.ID),
		factory.WorkoutRecordingKey(key),
	)
	s.factory.NewSet(
		factory.SetUserID(user),
		factory.SetWorkoutID(workout.ID),
		factory.SetExerciseID(exercise.ID),
		factory.SetDistance(1),
		factory.SetDurationSeconds(300),
	)

	for _, reference := range []apiv1.PaceReference{
		apiv1.PaceReference_PACE_REFERENCE_PREVIOUS,
		apiv1.PaceReference_PACE_REFERENCE_BEST,
	} {
		res, err := s.handler.GetPaceReference(ctx, connect.NewRequest(&apiv1.GetPaceReferenceRequest{
			RoutineId: routine.ID.String(),
			Reference: reference,
		}))
		s.Require().NoError(err)
		s.Require().JSONEq(`{"stored":true}`, res.Msg.GetRecordingJson())
	}
}

func (s *workoutSuite) recordingContext() (context.Context, uuid.UUID) {
	user := s.factory.NewUser()
	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())

	return xcontext.WithUserID(ctx, user.ID), user.ID
}

func (s *workoutSuite) recordedRequest(user uuid.UUID, startedAt, finishedAt time.Time, recording string) *apiv1.CreateWorkoutRequest {
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user))

	return &apiv1.CreateWorkoutRequest{
		WorkoutName: "Run",
		ExerciseSets: []*apiv1.ExerciseSets{{
			Exercise: &apiv1.Exercise{Id: exercise.ID.String()},
			Sets:     []*apiv1.Set{{Reps: 1, Weight: 1}},
		}},
		StartedAt:     timestamppb.New(startedAt),
		FinishedAt:    timestamppb.New(finishedAt),
		RecordingJson: recording,
	}
}
