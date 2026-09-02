package parser_test

import (
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/distanceunit"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
)

func newID() uuid.UUID {
	return uuid.Must(uuid.NewV4())
}

func startedAt() time.Time {
	return time.Date(2026, time.September, 1, 18, 0, 0, 0, time.UTC)
}

func finishedAt() time.Time {
	return startedAt().Add(time.Hour)
}

func newUser() *account.User {
	id := newID()
	return &account.User{
		ID:           id,
		Name:         "User " + id.String(),
		Username:     id.String(),
		WeightUnit:   weightunit.Kilograms,
		DistanceUnit: distanceunit.Kilometers,
	}
}

func newExercise() *training.Exercise {
	id := newID()
	return &training.Exercise{
		ID:      id,
		UserID:  newID(),
		Name:    "Exercise " + id.String(),
		Metrics: training.DefaultMetrics(),
	}
}

func newSet(exercise *training.Exercise, weight float64, reps int32) *training.Set {
	return &training.Set{
		ID:           newID(),
		WorkoutID:    newID(),
		ExerciseID:   exercise.ID,
		Weight:       weight,
		Reps:         reps,
		WeightUnit:   weightunit.Kilograms,
		DistanceUnit: distanceunit.Kilometers,
		CreatedAt:    startedAt(),
		Exercise:     exercise,
	}
}

func newWorkout() *training.Workout {
	id := newID()
	user := newUser()
	return &training.Workout{
		ID:         id,
		UserID:     user.ID,
		Name:       "Workout " + id.String(),
		StartedAt:  startedAt(),
		FinishedAt: finishedAt(),
		User:       user,
	}
}

func newComment(workoutID uuid.UUID) *training.WorkoutComment {
	id := newID()
	user := newUser()
	return &training.WorkoutComment{
		ID:        id,
		UserID:    user.ID,
		WorkoutID: workoutID,
		Comment:   "Comment " + id.String(),
		CreatedAt: startedAt(),
		User:      user,
	}
}

func newNotification(nType notification.Type, payload notification.Payload) *notification.Notification {
	return &notification.Notification{
		ID:        newID(),
		UserID:    newID(),
		Type:      nType,
		Payload:   payload,
		CreatedAt: startedAt(),
	}
}

func requireExercise(t *testing.T, expected *training.Exercise, actual *v1.Exercise) {
	t.Helper()
	require.Equal(t, expected.ID.String(), actual.GetId())
	require.Equal(t, expected.UserID.String(), actual.GetUserId())
	require.Equal(t, expected.Name, actual.GetName())
	require.Equal(t, expected.Tags, actual.GetTags())
}

// requireSet checks a kilogram set read back as entered, with the trophy the
// caller expects.
func requireSet(t *testing.T, expected *training.Set, actual *v1.Set, personalBest bool) {
	t.Helper()
	require.Equal(t, expected.ID.String(), actual.GetId())
	require.InEpsilon(t, expected.Weight, actual.GetWeight(), 0.001)
	require.Equal(t, expected.Reps, actual.GetReps())
	require.Equal(t, expected.WorkoutID.String(), actual.GetMetadata().GetWorkoutId())
	require.True(t, expected.CreatedAt.Equal(actual.GetMetadata().GetCreatedAt().AsTime()))
	require.Equal(t, personalBest, actual.GetMetadata().GetPersonalBest())
}

func TestExercise(t *testing.T) {
	t.Parallel()

	exercise := newExercise()
	exercise.Tags = []string{"chest", "push"}
	parsed := parser.Exercise(exercise)

	requireExercise(t, exercise, parsed)
	require.Equal(t, []v1.ExerciseMetric{
		v1.ExerciseMetric_EXERCISE_METRIC_WEIGHT,
		v1.ExerciseMetric_EXERCISE_METRIC_REPS,
	}, parsed.GetMetrics())
}

func TestExerciseSlice(t *testing.T) {
	t.Parallel()

	exercises := []*training.Exercise{newExercise(), newExercise()}
	parsed := parser.ExerciseSlice(exercises)

	require.Len(t, parsed, len(exercises))
	for i, exercise := range exercises {
		requireExercise(t, exercise, parsed[i])
	}
}

func TestUser(t *testing.T) {
	t.Parallel()

	user := newUser()
	user.Email = "alice@example.test"
	parsed := parser.User(user)
	require.Equal(t, user.Email, parsed.GetEmail())

	parsed = parser.User(user, parser.UserFollowed(true))
	require.True(t, parsed.GetFollowed())

	user.Email = ""
	parsed = parser.User(user)
	require.Equal(t, user.ID.String(), parsed.GetId())
	require.Equal(t, user.Name, parsed.GetName())
	require.False(t, parsed.GetFollowed())
	require.Empty(t, parsed.GetEmail())
}

func TestUserSlice(t *testing.T) {
	t.Parallel()

	users := []*account.User{newUser(), newUser()}
	for _, user := range users {
		user.Email = user.Username + "@example.test"
	}
	parsed := parser.UserSlice(users)

	require.Len(t, parsed, len(users))
	for i, user := range users {
		require.Equal(t, user.ID.String(), parsed[i].GetId())
		require.Equal(t, user.Name, parsed[i].GetName())
		require.Equal(t, user.Email, parsed[i].GetEmail())
		require.False(t, parsed[i].GetFollowed())
	}
}

func TestRoutine(t *testing.T) {
	t.Parallel()

	routine := &training.Routine{ID: newID(), Name: "Push day"}
	parsed := parser.Routine(routine)

	require.Equal(t, routine.ID.String(), parsed.GetId())
	require.Equal(t, routine.Name, parsed.GetName())
	require.Nil(t, parsed.GetExercises())

	routine.Exercises = []*training.Exercise{newExercise(), newExercise()}
	parsed = parser.Routine(routine)

	require.Len(t, parsed.GetExercises(), 2)
	for i, exercise := range routine.Exercises {
		requireExercise(t, exercise, parsed.GetExercises()[i])
	}
}

func TestRoutineSlice(t *testing.T) {
	t.Parallel()

	routines := []*training.Routine{
		{ID: newID(), Name: "Push day"},
		{ID: newID(), Name: "Pull day"},
	}
	parsed := parser.RoutineSlice(routines)

	require.Len(t, parsed, len(routines))
	for i, routine := range routines {
		require.Equal(t, routine.ID.String(), parsed[i].GetId())
		require.Equal(t, routine.Name, parsed[i].GetName())
		require.Nil(t, parsed[i].GetExercises())
	}
}

func TestRoutineWithGroups(t *testing.T) {
	t.Parallel()

	exercises := []*training.Exercise{newExercise(), newExercise(), newExercise()}
	routine := &training.Routine{ID: newID(), Name: "Upper", Exercises: exercises}
	straightID := newID()
	circuitID := newID()

	parsed := parser.RoutineWithGroups(routine, []*training.RoutineGroup{
		{
			ID:   straightID,
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.RoutineExercise{
				{Exercise: exercises[0], RestSeconds: 180},
			},
		},
		{
			ID:                          circuitID,
			Mode:                        training.RoutineGroupModeCircuit,
			RestBetweenExercisesSeconds: 15,
			RestBetweenRoundsSeconds:    90,
			Rounds:                      3,
			Exercises: []training.RoutineExercise{
				{Exercise: exercises[1], RestSeconds: 90},
				{Exercise: exercises[2], RestSeconds: 90},
			},
		},
	})

	// The flat list stays whole: a client that does not care how the routine is
	// grouped keeps reading only that.
	require.Len(t, parsed.GetExercises(), 3)
	require.Len(t, parsed.GetGroups(), 2)

	straight := parsed.GetGroups()[0]
	require.Equal(t, straightID.String(), straight.GetId())
	require.Equal(t, v1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, straight.GetMode())
	require.Len(t, straight.GetExercises(), 1)
	require.Equal(t, exercises[0].ID.String(), straight.GetExercises()[0].GetExercise().GetId())
	// The routine's own answer for that occurrence, which is the only place a
	// rest is written.
	require.Equal(t, int32(180), straight.GetExercises()[0].GetRestSeconds())

	circuit := parsed.GetGroups()[1]
	require.Equal(t, circuitID.String(), circuit.GetId())
	require.Equal(t, v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, circuit.GetMode())
	require.Equal(t, int32(15), circuit.GetRestBetweenExercisesSeconds())
	require.Equal(t, int32(90), circuit.GetRestBetweenRoundsSeconds())
	require.Equal(t, int32(3), circuit.GetRounds())
	require.Len(t, circuit.GetExercises(), 2)
	require.Equal(t, exercises[1].ID.String(), circuit.GetExercises()[0].GetExercise().GetId())
	// Carried even in a circuit, which does not rest between sets: a group
	// switched back to straight sets rests as it did before.
	require.Equal(t, int32(90), circuit.GetExercises()[0].GetRestSeconds())
}

func TestRoutineGroupMode(t *testing.T) {
	t.Parallel()

	require.Equal(
		t,
		v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT,
		parser.RoutineGroupModeToProto(training.RoutineGroupModeCircuit),
	)
	require.Equal(
		t,
		v1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT,
		parser.RoutineGroupModeToProto(training.RoutineGroupModeStraight),
	)

	require.Equal(
		t,
		training.RoutineGroupModeCircuit,
		parser.RoutineGroupModeFromProto(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT),
	)
	// Anything else is straight sets, which is what a routine that says nothing
	// about how it is worked through has always been.
	require.Equal(
		t,
		training.RoutineGroupModeStraight,
		parser.RoutineGroupModeFromProto(v1.RoutineGroupMode_ROUTINE_GROUP_MODE_UNSPECIFIED),
	)
}

func TestWorkout(t *testing.T) {
	t.Parallel()

	workout := newWorkout()
	workout.User = nil
	parsed := parser.Workout(workout)
	require.Nil(t, parsed.GetUser())
	require.Equal(t, workout.ID.String(), parsed.GetId())
	require.Equal(t, workout.Name, parsed.GetName())
	require.True(t, workout.StartedAt.Equal(parsed.GetStartedAt().AsTime()))
	require.True(t, workout.FinishedAt.Equal(parsed.GetFinishedAt().AsTime()))
	// A workout logged without a routine names none, not the nil UUID.
	require.Empty(t, parsed.GetRoutineId())

	workout = newWorkout()
	workout.RoutineID = newID()
	parsed = parser.Workout(workout)
	require.Equal(t, workout.RoutineID.String(), parsed.GetRoutineId())
	require.Equal(t, workout.User.ID.String(), parsed.GetUser().GetId())
	require.Equal(t, workout.User.Name, parsed.GetUser().GetName())
	require.False(t, parsed.GetUser().GetFollowed())
	require.Empty(t, parsed.GetUser().GetEmail())

	bench := newExercise()
	parsed = parser.Workout(newWorkout(), parser.WorkoutIntensity([]*training.Set{
		newSet(bench, 5, 2),
		newSet(bench, 10, 1),
	}))
	require.Equal(t, 20, int(parsed.GetIntensity()))

	workout = newWorkout()
	workout.Comments = []*training.WorkoutComment{newComment(workout.ID), newComment(workout.ID)}
	parsed = parser.Workout(workout)
	require.Len(t, parsed.GetComments(), 2)
	for i, comment := range workout.Comments {
		require.Equal(t, comment.ID.String(), parsed.GetComments()[i].GetId())
		require.Equal(t, comment.UserID.String(), parsed.GetComments()[i].GetUser().GetId())
		require.Equal(t, comment.Comment, parsed.GetComments()[i].GetComment())
	}

	sets := []*training.Set{newSet(bench, 60, 5), newSet(newExercise(), 100, 5)}
	parsed = parser.Workout(newWorkout(), parser.WorkoutExerciseSets(sets, sets[:1]))
	require.Len(t, parsed.GetExerciseSets(), 2)
	for i, exerciseSet := range parsed.GetExerciseSets() {
		require.Equal(t, sets[i].ExerciseID.String(), exerciseSet.GetExercise().GetId())
		for _, set := range exerciseSet.GetSets() {
			requireSet(t, sets[i], set, i == 0)
		}
	}

	workout = newWorkout()
	workout.Note = "note"
	require.Equal(t, "note", parser.Workout(workout).GetNote())
}

func TestWorkoutSlice(t *testing.T) {
	t.Parallel()

	t.Run("ok_workouts_with_relationships", func(t *testing.T) {
		t.Parallel()

		workout := newWorkout()
		workout.Sets = []*training.Set{newSet(newExercise(), 60, 5)}
		workout.Sets[0].WorkoutID = workout.ID
		workouts := []*training.Workout{workout}
		personalBests := workout.Sets[:1]

		parsed := parser.WorkoutSlice(workouts, personalBests)
		require.Len(t, parsed, len(workouts))

		for i, workout := range parsed {
			require.Equal(t, workouts[i].ID.String(), workout.GetId())
			require.Equal(t, workouts[i].Name, workout.GetName())
			require.True(t, workouts[i].StartedAt.Equal(workout.GetStartedAt().AsTime()))
			require.True(t, workouts[i].FinishedAt.Equal(workout.GetFinishedAt().AsTime()))

			require.NotNil(t, workout.GetUser())
			require.Equal(t, workouts[i].User.ID.String(), workout.GetUser().GetId())
			require.Equal(t, workouts[i].User.Name, workout.GetUser().GetName())

			require.NotNil(t, workout.GetExerciseSets())
			for j, exerciseSet := range workout.GetExerciseSets() {
				require.Equal(t, workouts[i].Sets[j].ExerciseID.String(), exerciseSet.GetExercise().GetId())
				for _, set := range exerciseSet.GetSets() {
					requireSet(t, workouts[i].Sets[j], set, i == 0 && j == 0)
				}
			}
		}
	})

	t.Run("ok_workout_without_relationship", func(t *testing.T) {
		t.Parallel()

		workout := newWorkout()
		workout.User = nil

		parsed := parser.WorkoutSlice([]*training.Workout{workout}, nil)
		require.Len(t, parsed, 1)
		require.Equal(t, workout.ID.String(), parsed[0].GetId())
		require.Nil(t, parsed[0].GetUser())
		require.Empty(t, parsed[0].GetExerciseSets())
	})
}

func TestWorkoutComment(t *testing.T) {
	t.Parallel()

	comment := newComment(newID())
	parsed := parser.WorkoutComment(comment)
	require.Equal(t, comment.User.ID.String(), parsed.GetUser().GetId())
	require.Equal(t, comment.User.Name, parsed.GetUser().GetName())
	require.Empty(t, parsed.GetUser().GetEmail())
	require.False(t, parsed.GetUser().GetFollowed())

	comment.User = nil
	parsed = parser.WorkoutComment(comment)
	require.Equal(t, comment.ID.String(), parsed.GetId())
	require.Nil(t, parsed.GetUser())
	require.Equal(t, comment.Comment, parsed.GetComment())
	require.True(t, comment.CreatedAt.Equal(parsed.GetCreatedAt().AsTime()))
}

func TestExerciseSetsSlice(t *testing.T) {
	t.Parallel()

	sets := []*training.Set{newSet(newExercise(), 60, 5)}
	parsed := parser.ExerciseSetsSlice(sets)

	require.Len(t, parsed, len(sets))
	for i, exerciseSets := range parsed {
		require.Equal(t, sets[i].ExerciseID.String(), exerciseSets.GetExercise().GetId())
		require.Empty(t, exerciseSets.GetExercise().GetTags())
		require.NotEmpty(t, exerciseSets.GetExercise().GetName())
		require.NotEmpty(t, exerciseSets.GetExercise().GetUserId())

		for _, set := range exerciseSets.GetSets() {
			requireSet(t, sets[i], set, false)
		}
	}

	parsed = parser.ExerciseSetsSlice(sets, parser.ExerciseSetsPersonalBests(sets[:1]))
	require.Len(t, parsed, len(sets))
	for i, exerciseSets := range parsed {
		require.Equal(t, sets[i].ExerciseID.String(), exerciseSets.GetExercise().GetId())
		for _, set := range exerciseSets.GetSets() {
			requireSet(t, sets[i], set, i == 0)
		}
	}
}

func TestExerciseSetSlice(t *testing.T) {
	t.Parallel()

	sets := []*training.Set{
		newSet(newExercise(), 60, 5),
		newSet(newExercise(), 100, 5),
	}
	parsed := parser.ExerciseSetSlice(sets)

	require.Len(t, parsed, len(sets))
	for i, exerciseSet := range parsed {
		require.Equal(t, sets[i].ExerciseID.String(), exerciseSet.GetExercise().GetId())
		requireSet(t, sets[i], exerciseSet.GetSet(), false)
	}
}

func TestExerciseSetsFromPB(t *testing.T) {
	t.Parallel()

	pounds := newSet(newExercise(), 100, 5)
	pounds.WeightUnit = weightunit.Pounds
	sets := parser.ExerciseSetsSlice([]*training.Set{
		newSet(newExercise(), 60, 5),
		pounds,
	})

	parsed, err := parser.ExerciseSetsFromPB(sets)
	require.NoError(t, err)
	require.Len(t, parsed, len(sets))
	for i, exerciseSets := range parsed {
		require.Equal(t, sets[i].GetExercise().GetId(), exerciseSets.ExerciseID.String())
		require.Len(t, exerciseSets.Sets, len(sets[i].GetSets()))
		for j, set := range exerciseSets.Sets {
			// The weight is read as entered, in the unit the request names;
			// converting it to kilograms is the store's job.
			require.InEpsilon(t, sets[i].GetSets()[j].GetWeight(), set.Weight, 0.001)
			require.Equal(t, parser.WeightUnitFromProto(sets[i].GetSets()[j].GetWeightUnit()), set.WeightUnit)
			require.Equal(t, int(sets[i].GetSets()[j].GetReps()), set.Reps)
		}
	}

	_, err = parser.ExerciseSetsFromPB([]*v1.ExerciseSets{{Exercise: &v1.Exercise{Id: "123"}}})
	require.ErrorIs(t, err, parser.ErrNotAUUID)
}

func TestNotification(t *testing.T) {
	t.Parallel()

	record := newNotification(notification.TypeWorkoutComment, notification.Payload{})
	parsed := parser.Notification(record)

	require.Equal(t, record.ID.String(), parsed.GetId())
	require.Equal(t, record.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())
	require.False(t, parsed.GetRead())
	require.Nil(t, parsed.GetUserFollowed())
	require.Nil(t, parsed.GetWorkoutComment().GetActor())
	require.Nil(t, parsed.GetWorkoutComment().GetWorkout())

	actor := newUser()
	parsed = parser.Notification(record, parser.NotificationActor(record.Type, actor))

	require.NotNil(t, parsed.GetWorkoutComment().GetActor())
	require.Equal(t, actor.ID.String(), parsed.GetWorkoutComment().GetActor().GetId())
	require.Equal(t, actor.Name, parsed.GetWorkoutComment().GetActor().GetName())
	require.Empty(t, parsed.GetWorkoutComment().GetActor().GetEmail())
	require.False(t, parsed.GetWorkoutComment().GetActor().GetFollowed())

	require.Nil(t, parsed.GetUserFollowed())
	require.Nil(t, parsed.GetWorkoutComment().GetWorkout())

	workout := newWorkout()
	parsed = parser.Notification(record, parser.NotificationWorkout(record.Type, workout))

	require.Nil(t, parsed.GetWorkoutComment().GetActor())
	requireNotifiedWorkout(t, workout, parsed)

	parsed = parser.Notification(
		record,
		parser.NotificationActor(record.Type, actor),
		parser.NotificationWorkout(record.Type, workout),
	)

	require.NotNil(t, parsed.GetWorkoutComment().GetActor())
	require.Equal(t, actor.ID.String(), parsed.GetWorkoutComment().GetActor().GetId())
	require.Equal(t, actor.Name, parsed.GetWorkoutComment().GetActor().GetName())
	require.Empty(t, parsed.GetWorkoutComment().GetActor().GetEmail())
	require.False(t, parsed.GetWorkoutComment().GetActor().GetFollowed())
	requireNotifiedWorkout(t, workout, parsed)

	record = newNotification(notification.TypeFollow, notification.Payload{})
	parsed = parser.Notification(record)

	require.Equal(t, record.ID.String(), parsed.GetId())
	require.Equal(t, record.CreatedAt.Unix(), parsed.GetNotifiedAtUnix())

	require.Nil(t, parsed.GetWorkoutComment())
	require.Nil(t, parsed.GetUserFollowed().GetActor())

	read := newNotification(notification.TypeFollow, notification.Payload{})
	read.ReadAt = finishedAt()
	require.True(t, parser.Notification(read).GetRead())

	actor = newUser()
	actor.Email = "bob@example.test"
	parsed = parser.Notification(record, parser.NotificationActor(record.Type, actor))

	require.Equal(t, actor.ID.String(), parsed.GetUserFollowed().GetActor().GetId())
	require.Equal(t, actor.Name, parsed.GetUserFollowed().GetActor().GetName())
	require.Equal(t, actor.Email, parsed.GetUserFollowed().GetActor().GetEmail())
	require.False(t, parsed.GetUserFollowed().GetActor().GetFollowed())

	require.Nil(t, parsed.GetWorkoutComment())
}

// requireNotifiedWorkout checks the workout a comment notification carries:
// the session and its athlete, and none of the detail the notification does
// not show.
func requireNotifiedWorkout(t *testing.T, workout *training.Workout, parsed *v1.Notification) {
	t.Helper()

	notified := parsed.GetWorkoutComment().GetWorkout()
	require.NotNil(t, notified)
	require.Equal(t, workout.ID.String(), notified.GetId())
	require.Equal(t, workout.Name, notified.GetName())
	require.True(t, workout.StartedAt.Equal(notified.GetStartedAt().AsTime()))
	require.True(t, workout.FinishedAt.Equal(notified.GetFinishedAt().AsTime()))

	require.NotNil(t, notified.GetUser())
	require.Equal(t, workout.User.ID.String(), notified.GetUser().GetId())
	require.Equal(t, workout.User.Name, notified.GetUser().GetName())
	require.Empty(t, notified.GetUser().GetEmail())
	require.False(t, notified.GetUser().GetFollowed())

	require.Nil(t, parsed.GetUserFollowed())
	require.Nil(t, notified.GetComments())
	require.Nil(t, notified.GetExerciseSets())
}

func TestNotificationSlice(t *testing.T) {
	t.Parallel()

	actors := []*account.User{newUser(), newUser()}
	for _, actor := range actors {
		actor.Email = actor.Username + "@example.test"
	}
	workouts := []*training.Workout{newWorkout()}
	notifications := []*notification.Notification{
		newNotification(notification.TypeFollow, notification.Payload{
			ActorID: actors[0].ID,
		}),
		newNotification(notification.TypeWorkoutComment, notification.Payload{
			ActorID:   actors[1].ID,
			WorkoutID: workouts[0].ID,
		}),
		// A notification about someone who can no longer be found is left out.
		newNotification(notification.TypeFollow, notification.Payload{
			ActorID: newID(),
		}),
	}

	parsed := parser.NotificationSlice(notifications, actors, workouts)
	require.Len(t, parsed, 2)
	for i, record := range parsed {
		require.Equal(t, notifications[i].ID.String(), record.GetId())
		require.Equal(t, notifications[i].CreatedAt.Unix(), record.GetNotifiedAtUnix())
	}

	followed := parsed[0]
	require.NotNil(t, followed.GetUserFollowed())
	require.NotNil(t, followed.GetUserFollowed().GetActor())
	require.Equal(t, actors[0].ID.String(), followed.GetUserFollowed().GetActor().GetId())
	require.Equal(t, actors[0].Name, followed.GetUserFollowed().GetActor().GetName())
	require.Equal(t, actors[0].Email, followed.GetUserFollowed().GetActor().GetEmail())
	require.False(t, followed.GetUserFollowed().GetActor().GetFollowed())
	require.Nil(t, followed.GetWorkoutComment())

	commented := parsed[1]
	require.NotNil(t, commented.GetWorkoutComment())
	require.NotNil(t, commented.GetWorkoutComment().GetActor())
	require.Equal(t, actors[1].ID.String(), commented.GetWorkoutComment().GetActor().GetId())
	require.Equal(t, actors[1].Name, commented.GetWorkoutComment().GetActor().GetName())
	require.Equal(t, actors[1].Email, commented.GetWorkoutComment().GetActor().GetEmail())
	require.False(t, commented.GetWorkoutComment().GetActor().GetFollowed())
	requireNotifiedWorkout(t, workouts[0], commented)
}

func TestFeedItemSlice(t *testing.T) {
	t.Parallel()

	workout := newWorkout()
	workout.Sets = []*training.Set{newSet(newExercise(), 60, 5)}
	workout.Sets[0].WorkoutID = workout.ID
	workout.CreatedAt = time.Now().UTC()
	workouts := []*training.Workout{workout}

	parsed := parser.FeedItemSlice(workouts, nil)
	require.Len(t, parsed, len(workouts))

	feedItem := parsed[0]
	require.True(t, workout.CreatedAt.Equal(feedItem.GetCreatedAt().AsTime()))
	require.NotNil(t, feedItem.GetWorkout())
	require.Equal(t, workout.ID.String(), feedItem.GetWorkout().GetId())
	require.Equal(t, workout.Name, feedItem.GetWorkout().GetName())
	require.True(t, workout.StartedAt.Equal(feedItem.GetWorkout().GetStartedAt().AsTime()))
	require.True(t, workout.FinishedAt.Equal(feedItem.GetWorkout().GetFinishedAt().AsTime()))

	require.NotNil(t, feedItem.GetWorkout().GetUser())
	require.Equal(t, workout.User.ID.String(), feedItem.GetWorkout().GetUser().GetId())
	require.Equal(t, workout.User.Name, feedItem.GetWorkout().GetUser().GetName())
	require.False(t, feedItem.GetWorkout().GetUser().GetFollowed())
	require.Empty(t, feedItem.GetWorkout().GetUser().GetEmail())

	require.NotNil(t, feedItem.GetWorkout().GetExerciseSets())
	require.Len(t, feedItem.GetWorkout().GetExerciseSets(), len(workout.Sets))
	for j, exerciseSet := range feedItem.GetWorkout().GetExerciseSets() {
		for _, set := range exerciseSet.GetSets() {
			requireSet(t, workout.Sets[j], set, false)
		}
	}

	require.Nil(t, feedItem.GetWorkout().GetComments())
}

func TestSet(t *testing.T) {
	t.Parallel()

	set := newSet(newExercise(), 60, 5)
	parsed := parser.Set(set, nil)
	requireSet(t, set, parsed, false)

	parsed = parser.Set(set, map[string]struct{}{set.ID.String(): {}})
	require.True(t, parsed.GetMetadata().GetPersonalBest())
}

func TestSetRestoresEnteredPounds(t *testing.T) {
	t.Parallel()

	set := newSet(newExercise(), 45.36, 5)
	set.WeightUnit = weightunit.Pounds
	parsed := parser.Set(set, nil)

	require.Equal(t, v1.WeightUnit_WEIGHT_UNIT_POUNDS, parsed.GetWeightUnit())
	require.InEpsilon(t, 100, parsed.GetWeight(), 0.001)
}

func TestSetSlice(t *testing.T) {
	t.Parallel()

	bench := newExercise()
	sets := []*training.Set{newSet(bench, 60, 5), newSet(bench, 65, 3)}
	parsed := parser.SetSlice(sets, nil)

	require.Len(t, parsed, len(sets))
	for i, set := range parsed {
		requireSet(t, sets[i], set, false)
	}

	parsed = parser.SetSlice(sets, sets[:1])
	require.Len(t, parsed, len(sets))
	for i, set := range parsed {
		requireSet(t, sets[i], set, i == 0)
	}
}

// A metric the schema does not know is dropped on the way out and read back as
// the unspecified one: an exercise saved by a newer client must not arrive
// claiming to measure something this one does not understand. The store's
// check refuses such a metric — the parser is the second line, not the first.
func TestUnknownExerciseMetricsAreDropped(t *testing.T) {
	t.Parallel()

	exercise := newExercise()
	exercise.Metrics = []training.Metric{training.MetricWeight, "cadence", training.MetricReps}
	parsed := parser.Exercise(exercise)

	require.Equal(t, []v1.ExerciseMetric{
		v1.ExerciseMetric_EXERCISE_METRIC_WEIGHT,
		v1.ExerciseMetric_EXERCISE_METRIC_REPS,
	}, parsed.GetMetrics())

	require.Equal(
		t,
		[]training.Metric{training.Metric(""), training.Metric("")},
		parser.ExerciseMetricsFromProto([]v1.ExerciseMetric{
			v1.ExerciseMetric_EXERCISE_METRIC_UNSPECIFIED,
			v1.ExerciseMetric(999),
		}),
	)
}

// The personal-best pass owns the metadata it writes: a set that arrived
// without any is given some rather than skipped.
func TestExerciseSetsPersonalBestsFillsMissingMetadata(t *testing.T) {
	t.Parallel()

	bench := newExercise()
	best := newSet(bench, 100, 1)
	other := newSet(bench, 60, 5)

	sets := &v1.ExerciseSets{
		Exercise: &v1.Exercise{Id: bench.ID.String()},
		Sets: []*v1.Set{
			{Id: best.ID.String(), Metadata: nil},
			{Id: other.ID.String(), Metadata: nil},
		},
	}
	parser.ExerciseSetsPersonalBests([]*training.Set{best})(sets)

	require.True(t, sets.GetSets()[0].GetMetadata().GetPersonalBest())
	require.NotNil(t, sets.GetSets()[1].GetMetadata())
	require.False(t, sets.GetSets()[1].GetMetadata().GetPersonalBest())
}

// Both notification options are given what the notification is not about, so
// each has to leave it alone rather than reshape it.
func TestNotificationOptionsIgnoreWhatIsNotTheirs(t *testing.T) {
	t.Parallel()

	n := &v1.Notification{Id: newID().String()}

	parser.NotificationActor(notification.TypeFollow, nil)(n)
	require.Nil(t, n.GetType())

	parser.NotificationWorkout(notification.TypeFollow, newWorkout())(n)
	require.Nil(t, n.GetType())

	parser.NotificationWorkout(notification.TypeWorkoutComment, nil)(n)
	require.Nil(t, n.GetType())
}

// A set finds its block by the occurrence that logged it, so the same exercise
// trained in two blocks reads back as two pieces of work. A block whose sets
// were all edited away has nothing left to show and is left out.
func TestWorkoutGroups(t *testing.T) {
	t.Parallel()

	bench := newExercise()
	row := newExercise()
	benchInWarmUp := newID()
	benchInCircuit := newID()
	rowInCircuit := newID()
	warmUpID := newID()
	circuitID := newID()
	records := []training.WorkoutGroupRecord{
		{
			ID:   warmUpID,
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.WorkoutGroupOccurrence{
				{ID: benchInWarmUp, ExerciseID: bench.ID},
			},
		},
		{
			ID:                          circuitID,
			Mode:                        training.RoutineGroupModeCircuit,
			RestBetweenExercisesSeconds: 15,
			RestBetweenRoundsSeconds:    90,
			Rounds:                      2,
			Exercises: []training.WorkoutGroupOccurrence{
				{ID: benchInCircuit, ExerciseID: bench.ID},
				{ID: rowInCircuit, ExerciseID: row.ID},
			},
		},
		{
			ID:   newID(),
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.WorkoutGroupOccurrence{
				{ID: newID(), ExerciseID: row.ID},
			},
		},
	}

	logged := func(exercise *training.Exercise, position int32, occurrenceID uuid.UUID) *training.Set {
		set := newSet(exercise, 60, 5)
		set.Position = position
		set.OccurrenceID = occurrenceID
		return set
	}
	first := logged(bench, 0, benchInWarmUp)
	second := logged(bench, 1, benchInWarmUp)
	third := logged(bench, 2, benchInCircuit)
	fourth := logged(row, 3, rowInCircuit)
	// Listed out of logged order, and with a set stored ungrouped, which no
	// block can claim.
	sets := []*training.Set{second, first, fourth, third, logged(bench, 4, uuid.Nil)}

	groups := parser.WorkoutGroups(records, sets, []*training.Set{third})
	require.Len(t, groups, 2)

	warmUp := groups[0]
	require.Equal(t, warmUpID.String(), warmUp.GetId())
	require.Equal(t, v1.RoutineGroupMode_ROUTINE_GROUP_MODE_STRAIGHT, warmUp.GetMode())
	require.Len(t, warmUp.GetExercises(), 1)
	require.Equal(t, bench.ID.String(), warmUp.GetExercises()[0].GetExercise().GetId())
	require.Equal(t, int32(2), warmUp.GetExercises()[0].GetSetCount())
	require.Equal(t, []string{first.ID.String(), second.ID.String()}, setIDs(warmUp.GetExercises()[0].GetSets()))
	require.False(t, warmUp.GetExercises()[0].GetSets()[0].GetMetadata().GetPersonalBest())

	circuit := groups[1]
	require.Equal(t, circuitID.String(), circuit.GetId())
	require.Equal(t, v1.RoutineGroupMode_ROUTINE_GROUP_MODE_CIRCUIT, circuit.GetMode())
	require.Equal(t, int32(15), circuit.GetRestBetweenExercisesSeconds())
	require.Equal(t, int32(90), circuit.GetRestBetweenRoundsSeconds())
	require.Equal(t, int32(2), circuit.GetRounds())
	require.Len(t, circuit.GetExercises(), 2)
	require.Equal(t, bench.ID.String(), circuit.GetExercises()[0].GetExercise().GetId())
	require.Equal(t, []string{third.ID.String()}, setIDs(circuit.GetExercises()[0].GetSets()))
	// The trophy reaches a circuit's rounds too.
	require.True(t, circuit.GetExercises()[0].GetSets()[0].GetMetadata().GetPersonalBest())
	require.Equal(t, row.ID.String(), circuit.GetExercises()[1].GetExercise().GetId())
	require.Equal(t, []string{fourth.ID.String()}, setIDs(circuit.GetExercises()[1].GetSets()))
}

func setIDs(sets []*v1.Set) []string {
	ids := make([]string, 0, len(sets))
	for _, set := range sets {
		ids = append(ids, set.GetId())
	}
	return ids
}
