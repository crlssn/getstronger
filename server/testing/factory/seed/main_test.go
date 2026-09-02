package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestSeedPersonas(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	f := factory.NewFactory(c.DB)
	config := personaConfig{
		active: factory.SeedUser{
			Email:    "active@test.local",
			Password: "password123",
			Name:     "Alex Morgan",
		},
		new: factory.SeedUser{
			Email:    "new@test.local",
			Password: "password123",
			Name:     "Sam Taylor",
		},
	}

	active, newlySignedUp := seedPersonas(bob.NewDB(c.DB), f, config)
	require.NotNil(t, active)
	require.NotNil(t, newlySignedUp)

	activeAuth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(config.active.Email),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.NoError(t, bcrypt.CompareHashAndPassword(activeAuth.Password, []byte(config.active.Password)))
	require.WithinDuration(t, time.Now().UTC().Add(-365*24*time.Hour), active.CreatedAt, 24*time.Hour)

	activeWorkouts, err := models.Workouts.Query(
		models.SelectWhere.Workouts.UserID.EQ(active.ID),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(activeWorkouts), 52)
	oldestWorkout := time.Now().UTC()
	newestWorkout := time.Time{}
	for _, workout := range activeWorkouts {
		if workout.FinishedAt.Before(oldestWorkout) {
			oldestWorkout = workout.FinishedAt
		}
		if workout.FinishedAt.After(newestWorkout) {
			newestWorkout = workout.FinishedAt
		}
	}
	require.WithinRange(t, oldestWorkout, time.Now().UTC().Add(-370*24*time.Hour), time.Now().UTC().Add(-350*24*time.Hour))
	require.WithinRange(t, newestWorkout, time.Now().UTC().Add(-24*time.Hour), time.Now().UTC())

	followerCount, err := models.Followers.Query(
		models.SelectWhere.Followers.FolloweeID.EQ(active.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.GreaterOrEqual(t, followerCount, int64(3))
	followeeCount, err := models.Followers.Query(
		models.SelectWhere.Followers.FollowerID.EQ(active.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.GreaterOrEqual(t, followeeCount, int64(3))

	// The trend chart's cardio measures need a distance-and-time history, with
	// sets spread over more than one day and more than one per workout.
	runExercise, err := models.Exercises.Query(
		models.SelectWhere.Exercises.UserID.EQ(active.ID),
		models.SelectWhere.Exercises.Title.EQ("Run"),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.ElementsMatch(t, []string{"distance", "time"}, []string(runExercise.Metrics))

	runSets, err := models.Sets.Query(
		models.SelectWhere.Sets.ExerciseID.EQ(runExercise.ID),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.GreaterOrEqual(t, len(runSets), 7)
	runDays := make(map[string]int)
	for _, set := range runSets {
		require.Positive(t, set.Distance)
		require.Positive(t, set.DurationSeconds)
		runDays[set.CreatedAt.Format("2006-01-02")]++
	}
	require.GreaterOrEqual(t, len(runDays), 3)

	newAuth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(config.new.Email),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.NoError(t, bcrypt.CompareHashAndPassword(newAuth.Password, []byte(config.new.Password)))
	require.WithinDuration(t, time.Now().UTC(), newlySignedUp.CreatedAt, time.Minute)

	newWorkoutCount, err := models.Workouts.Query(
		models.SelectWhere.Workouts.UserID.EQ(newlySignedUp.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, newWorkoutCount)
	newExerciseCount, err := models.Exercises.Query(
		models.SelectWhere.Exercises.UserID.EQ(newlySignedUp.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, newExerciseCount)
	newFollowerCount, err := models.Followers.Query(
		models.SelectWhere.Followers.FolloweeID.EQ(newlySignedUp.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	newFolloweeCount, err := models.Followers.Query(
		models.SelectWhere.Followers.FollowerID.EQ(newlySignedUp.ID),
	).Count(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Zero(t, newFollowerCount+newFolloweeCount)
}

func TestSeedJaneDoe(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	f := factory.NewFactory(c.DB)
	john := f.NewUser(
		factory.UserName("John Doe"),
	)
	johnWorkouts := f.NewWorkoutSlice(4, factory.WorkoutUserID(john.ID))

	seedJaneDoe(bob.NewDB(c.DB), f, john)

	jane, err := models.Users.Query(
		models.SelectWhere.Users.Name.EQ("Jane Doe"),
	).One(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Equal(t, "Jane Doe", jane.Name)

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
	require.Len(t, comments, 4)
	johnWorkoutIDs := make(map[uuid.UUID]struct{}, len(johnWorkouts))
	for _, workout := range johnWorkouts {
		johnWorkoutIDs[workout.ID] = struct{}{}
	}
	for _, comment := range comments {
		_, commentsOnJohnWorkout := johnWorkoutIDs[comment.WorkoutID]
		require.True(t, commentsOnJohnWorkout)
		require.NotEmpty(t, comment.Comment)
	}

	notifications, err := models.Notifications.Query(
		models.SelectWhere.Notifications.UserID.EQ(john.ID),
		models.SelectWhere.Notifications.Type.EQ(notification.TypeWorkoutComment),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, notifications, 4)
	readCount := 0
	unreadCount := 0
	for _, stored := range notifications {
		if stored.ReadAt.IsNull() {
			unreadCount++
		} else {
			readCount++
		}

		var payload notification.Payload
		require.NoError(t, json.Unmarshal(stored.Payload.Val, &payload))
		require.Equal(t, jane.ID, payload.ActorID)
		_, notifiesAboutJohnWorkout := johnWorkoutIDs[payload.WorkoutID]
		require.True(t, notifiesAboutJohnWorkout)
	}
	require.Equal(t, 2, readCount)
	require.Equal(t, 2, unreadCount)
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

	require.NoError(t, truncateDatabase(ctx, bob.NewDB(c.DB)))

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

func TestSeedConfig(t *testing.T) {
	tests := []struct {
		name        string
		environment string
		expectError bool
	}{
		{name: "local_seeds", environment: "local"},
		{name: "beta_seeds", environment: "beta"},
		{name: "production_refuses", environment: "production", expectError: true},
		{name: "unset_refuses", environment: "", expectError: true},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("ENV", test.environment)

			c, err := seedConfig()
			if test.expectError {
				require.ErrorIs(t, err, errNotSeedable)
				require.Nil(t, c)
				return
			}

			require.NoError(t, err)
			require.Equal(t, test.environment, string(c.Environment))
		})
	}
}

// The truncate and every insert share one transaction, so a mid-seed failure
// leaves the previous data in place rather than a truncated, half-seeded
// database. A rollback stands in for the failure here.
func TestSeedIsAtomic(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	existing := factory.NewFactory(c.DB).NewUser(factory.UserName("Existing User"))

	tx, err := c.DB.BeginTx(ctx, nil)
	require.NoError(t, err)
	exec := bob.NewTx(tx)
	require.NoError(t, truncateDatabase(ctx, exec))
	f := factory.NewFactoryExec(exec)
	seedPersonas(exec, f, personaConfig{
		active: factory.SeedUser{Email: "active@test.local", Password: "password123", Name: "Alex Morgan"},
		new:    factory.SeedUser{Email: "new@test.local", Password: "password123", Name: "Sam Taylor"},
	})
	require.NoError(t, tx.Rollback())

	users, err := models.Users.Query().All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, users, 1)
	require.Equal(t, existing.ID, users[0].ID)
}

func TestGuardSeedPassword(t *testing.T) {
	t.Parallel()

	require.NoError(t, guardSeedPassword(config.EnvironmentLocal, defaultSeedPassword))
	require.NoError(t, guardSeedPassword(config.EnvironmentBeta, "a-real-password"))
	require.ErrorIs(t, guardSeedPassword(config.EnvironmentBeta, defaultSeedPassword), errDefaultSeedPassword)
	require.ErrorIs(t, guardSeedPassword(config.EnvironmentProduction, defaultSeedPassword), errDefaultSeedPassword)
}
