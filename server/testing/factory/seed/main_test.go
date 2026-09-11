package main

import (
	"context"
	"encoding/json"
	"slices"
	"testing"
	"time"

	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql/sm"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/models/enums"
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
	// A day since the feed was last shown, so the home page has workouts to
	// mark as new: the followees each logged one within the last day.
	require.WithinDuration(t, time.Now().UTC().Add(-24*time.Hour), active.FeedSeenAt.GetOrZero(), time.Minute)

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

	// Beta is reseeded on every deploy, so a feature with no seeded example
	// cannot be looked at there: blocks and plans each need one.
	requireSeededBlocks(ctx, t, bob.NewDB(c.DB), activeWorkouts)
	requireSeededPlan(ctx, t, bob.NewDB(c.DB), active)

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

// The session the active persona trained in blocks: a straight block and a
// circuit, with every set naming the block that logged it. Without it beta
// renders every workout the way it did before blocks were recorded.
// requireSeededBlocks checks the persona trains sessions that carry the blocks
// they were worked in, a circuit among them, and that a recorded session's
// every set belongs to one.
func requireSeededBlocks(ctx context.Context, t *testing.T, exec bob.Executor, workouts models.WorkoutSlice) {
	t.Helper()

	workoutIDs := make([]uuid.UUID, 0, len(workouts))
	for _, workout := range workouts {
		workoutIDs = append(workoutIDs, workout.ID)
	}
	groups, err := models.WorkoutGroups.Query(
		models.SelectWhere.WorkoutGroups.WorkoutID.In(workoutIDs...),
	).All(ctx, exec)
	require.NoError(t, err)

	blocked := make(map[uuid.UUID]struct{}, len(groups))
	circuits := 0
	for _, group := range groups {
		blocked[group.WorkoutID] = struct{}{}
		if group.Mode == enums.RoutineGroupModeCircuit {
			circuits++
		}
	}
	require.GreaterOrEqual(t, len(blocked), 3)
	require.Positive(t, circuits)

	for _, workout := range workouts {
		if workout.RecordingJSON == "" {
			continue
		}

		sets, setsErr := models.Sets.Query(
			models.SelectWhere.Sets.WorkoutID.EQ(workout.ID),
		).All(ctx, exec)
		require.NoError(t, setsErr)
		require.NotEmpty(t, sets)
		for _, set := range sets {
			require.False(t, set.WorkoutGroupExerciseID.IsNull())
		}
	}
}

// requireSeededPlan checks the persona follows a plan the dashboard can show:
// active, holding a rotation, and pointing inside it.
func requireSeededPlan(ctx context.Context, t *testing.T, exec bob.Executor, active *models.User) {
	t.Helper()

	plan, err := models.Plans.Query(
		models.SelectWhere.Plans.UserID.EQ(active.ID),
		models.SelectWhere.Plans.Active.EQ(true),
	).One(ctx, exec)
	require.NoError(t, err)

	routineCount, err := models.PlanRoutines.Query(
		models.SelectWhere.PlanRoutines.PlanID.EQ(plan.ID),
	).Count(ctx, exec)
	require.NoError(t, err)
	require.GreaterOrEqual(t, routineCount, int64(2))
	require.Less(t, int64(plan.CurrentPosition), routineCount)
}

func TestSeedActiveBlocks(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	exec := bob.NewDB(c.DB)
	f := factory.NewFactory(c.DB)
	active := f.NewUser()
	for _, title := range []string{factory.TitleBackSquat, factory.TitlePushUp, factory.TitleWalkingLunge} {
		f.NewExercise(factory.ExerciseUserID(active.ID), factory.ExerciseTitle(title))
	}

	workout := seedActiveBlocks(exec, f, active)

	groups, err := models.WorkoutGroups.Query(
		models.SelectWhere.WorkoutGroups.WorkoutID.EQ(workout.ID),
		sm.OrderBy(models.WorkoutGroups.Columns.Position),
	).All(ctx, exec)
	require.NoError(t, err)
	require.Len(t, groups, 2)
	require.Equal(t, enums.RoutineGroupModeStraight, groups[0].Mode)
	require.Equal(t, enums.RoutineGroupModeCircuit, groups[1].Mode)
	require.Equal(t, int32(blockedCircuitRounds), groups[1].Rounds)
	require.Positive(t, groups[1].RestBetweenRoundsSeconds)

	occurrences, err := models.WorkoutGroupExercises.Query(
		models.SelectWhere.WorkoutGroupExercises.WorkoutGroupID.In(groups[0].ID, groups[1].ID),
	).All(ctx, exec)
	require.NoError(t, err)
	require.Len(t, occurrences, 3)

	sets, err := models.Sets.Query(
		models.SelectWhere.Sets.WorkoutID.EQ(workout.ID),
	).All(ctx, exec)
	require.NoError(t, err)
	require.Len(t, sets, blockedStraightSets+blockedCircuitRounds*2)

	positions := make(map[uuid.UUID][]int32)
	for _, set := range sets {
		require.False(t, set.WorkoutGroupExerciseID.IsNull())
		positions[set.ExerciseID] = append(positions[set.ExerciseID], set.Position)
	}
	require.Len(t, positions, 3)
	for _, exercisePositions := range positions {
		slices.Sort(exercisePositions)
		require.Equal(t, []int32{0, 1, 2}, exercisePositions)
	}
}

// The plan the active persona follows: active, holding routines they already
// train, and part-way through its rotation so the dashboard shows a plan
// underway rather than one never started.
func TestSeedActivePlan(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	c := container.NewContainer(ctx)
	t.Cleanup(func() {
		require.NoError(t, c.Terminate(ctx))
	})
	exec := bob.NewDB(c.DB)
	f := factory.NewFactory(c.DB)
	active := f.NewUser()

	// Dated apart so the rotation the seed picks is the persona's oldest
	// routines, in the order they were built.
	oldest := make(models.RoutineSlice, 0, planRoutineCount+1)
	for index := range planRoutineCount + 1 {
		oldest = append(oldest, f.NewRoutine(
			factory.RoutineUserID(active.ID),
			factory.RoutineCreatedAt(factory.Now().Add(-time.Duration(planRoutineCount+1-index)*time.Hour)),
		))
	}

	plan := seedActivePlan(exec, f, active)

	stored, err := models.FindPlan(ctx, exec, plan.ID)
	require.NoError(t, err)
	require.Equal(t, active.ID, stored.UserID)
	require.True(t, stored.Active)
	require.Equal(t, int32(planCurrentPosition), stored.CurrentPosition)
	require.Less(t, stored.CurrentPosition, int32(planRoutineCount))

	planRoutines, err := models.PlanRoutines.Query(
		models.SelectWhere.PlanRoutines.PlanID.EQ(plan.ID),
		sm.OrderBy(models.PlanRoutines.Columns.Position),
	).All(ctx, exec)
	require.NoError(t, err)
	require.Len(t, planRoutines, planRoutineCount)
	for position, planRoutine := range planRoutines {
		require.Equal(t, int32(position), planRoutine.Position)
		require.Equal(t, oldest[position].ID, planRoutine.RoutineID)
	}
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

	likes, err := models.WorkoutLikes.Query(
		models.SelectWhere.WorkoutLikes.UserID.EQ(jane.ID),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, likes, 3)
	for _, like := range likes {
		_, repsAJohnWorkout := johnWorkoutIDs[like.WorkoutID]
		require.True(t, repsAJohnWorkout)
	}

	repNotifications, err := models.Notifications.Query(
		models.SelectWhere.Notifications.UserID.EQ(john.ID),
		models.SelectWhere.Notifications.Type.EQ(notification.TypeWorkoutLike),
	).All(ctx, bob.NewDB(c.DB))
	require.NoError(t, err)
	require.Len(t, repNotifications, 3)
	for _, stored := range repNotifications {
		var payload notification.Payload
		require.NoError(t, json.Unmarshal(stored.Payload.Val, &payload))
		require.Equal(t, jane.ID, payload.ActorID)
		require.Equal(t, notification.WorkoutLikeEventID(jane.ID, payload.WorkoutID), payload.EventID)
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
