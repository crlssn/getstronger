package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestSeedJaneDoe(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	f := factory.NewFactory(c.DB)
	john := f.NewUser(
		factory.UserFirstName("John"),
		factory.UserLastName("Doe"),
	)
	johnWorkouts := f.NewWorkoutSlice(3, factory.WorkoutUserID(john.ID))

	seedJaneDoe(c.DB, f, john, "password")

	janeAuth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ("jane@doe.com"),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	jane, err := models.Users.Query(
		models.SelectWhere.Users.AuthID.EQ(janeAuth.ID),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, "Jane", jane.FirstName)
	require.Equal(t, "Doe", jane.LastName)

	followsJane, err := models.Followers.Query(
		models.SelectWhere.Followers.FollowerID.EQ(john.ID),
		models.SelectWhere.Followers.FolloweeID.EQ(jane.ID),
	).Exists(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.True(t, followsJane)

	exerciseCount, err := models.Exercises.Query(models.SelectWhere.Exercises.UserID.EQ(jane.ID)).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, int64(4), exerciseCount)

	workouts, err := models.Workouts.Query(models.SelectWhere.Workouts.UserID.EQ(jane.ID)).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, workouts, 3)
	for _, workout := range workouts {
		require.WithinRange(t, workout.FinishedAt, time.Now().UTC().Add(-5*24*time.Hour), time.Now().UTC())
		sets, setsErr := models.Sets.Query(models.SelectWhere.Sets.WorkoutID.EQ(workout.ID)).All(ctx, bob.NewDB(c.DB))
		require.NoError(t, setsErr)
		setsByExercise := make(map[string]int)
		for _, set := range sets {
			setsByExercise[set.ExerciseID.String()]++
		}
		for _, setCount := range setsByExercise {
			require.GreaterOrEqual(t, setCount, 3)
			require.LessOrEqual(t, setCount, 6)
		}
	}

	comments, err := models.WorkoutComments.Query(
		models.SelectWhere.WorkoutComments.UserID.EQ(jane.ID),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, comments, 3)
	johnWorkoutIDs := make(map[string]struct{}, len(johnWorkouts))
	for _, workout := range johnWorkouts {
		johnWorkoutIDs[workout.ID.String()] = struct{}{}
	}
	for _, comment := range comments {
		_, commentsOnJohnWorkout := johnWorkoutIDs[comment.WorkoutID.String()]
		require.True(t, commentsOnJohnWorkout)
		require.NotEmpty(t, comment.Comment)
	}

	notifications, err := models.Notifications.Query(
		models.SelectWhere.Notifications.UserID.EQ(john.ID),
		models.SelectWhere.Notifications.Type.EQ(repo.NotificationTypeWorkoutComment),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, notifications, 3)
	for _, notification := range notifications {
		require.True(t, notification.ReadAt.IsNull())

		var payload repo.NotificationPayload
		require.NoError(t, json.Unmarshal(notification.Payload.Val, &payload))
		require.Equal(t, jane.ID.String(), payload.ActorID)
		_, notifiesAboutJohnWorkout := johnWorkoutIDs[payload.WorkoutID]
		require.True(t, notifiesAboutJohnWorkout)
	}
}

func TestTruncateDatabase(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	f := factory.NewFactory(c.DB)
	user := f.NewUser()
	f.NewExercise(factory.ExerciseUserID(user.ID))
	f.NewWorkout(factory.WorkoutUserID(user.ID))

	require.NoError(t, truncateDatabase(ctx, c.DB))

	userCount, err := models.Users.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, userCount)
	exerciseCount, err := models.Exercises.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, exerciseCount)
	workoutCount, err := models.Workouts.Query().Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, workoutCount)
}
