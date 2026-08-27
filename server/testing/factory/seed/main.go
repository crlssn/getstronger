package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"github.com/aarondl/opt/omit"
	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/weightunit"
)

const (
	backgroundUserCount    = 6
	exerciseCount          = 10
	routineCount           = 5
	activeWorkoutCount     = 52
	backgroundWorkoutCount = 5
	workoutExerciseCount   = 5
	workoutSetsMin         = 3
	workoutSetsMax         = 6
	workoutCommentCount    = 2
	activeAccountAge       = 365 * 24 * time.Hour
	activeWorkoutInterval  = 7 * 24 * time.Hour
	// Without these the background accounts finish every workout at seed time,
	// and the feed is a dozen consecutive "Just now" cards — which reads as
	// broken rather than as fresh.
	backgroundWorkoutInterval = 3 * 24 * time.Hour
	backgroundWorkoutStagger  = 5 * time.Hour
	defaultActiveEmail        = "active@getstronger.test"
	defaultNewEmail           = "new@getstronger.test"
	defaultSeedPassword       = "password123"
)

type personaConfig struct {
	active factory.SeedUser
	new    factory.SeedUser
}

var (
	errNotSeedable         = errors.New("environment is not seedable")
	errDefaultSeedPassword = errors.New("the default seed password is published in the repository: pass -password")
)

// guardSeedPassword keeps the published local default out of deployed
// environments, whose seeded logins are publicly reachable.
func guardSeedPassword(environment config.Environment, password string) error {
	if !environment.Local() && password == defaultSeedPassword {
		return errDefaultSeedPassword
	}

	return nil
}

// seedConfig loads the configuration and refuses any environment the seed may
// not wipe. Seeding truncates every table, so this guard is what stands between
// a misconfigured deploy and real accounts.
func seedConfig() (*config.Config, error) {
	// Only local runs have a .env to read; the deploy passes its configuration
	// through the environment.
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("load .env file: %w", err)
	}

	c := config.New()
	if !c.Environment.Seedable() {
		return nil, fmt.Errorf("%w: %q", errNotSeedable, c.Environment)
	}

	return c, nil
}

func main() {
	c, err := seedConfig()
	if err != nil {
		log.Fatalf("Resolve seed configuration: %v", err)
	}

	database, err := db.New(c)
	if err != nil {
		log.Fatalf("Connect to database: %v", err)
	}

	email := flag.String("email", defaultActiveEmail, "the active persona's email")
	password := flag.String("password", defaultSeedPassword, "the seed personas' shared password")
	name := flag.String("name", "Alex Morgan", "the active persona's name")
	username := flag.String("username", "alex", "the active persona's username")
	newEmail := flag.String("new-email", defaultNewEmail, "the newly signed-up persona's email")
	newName := flag.String("new-name", "Sam Taylor", "the newly signed-up persona's name")
	newUsername := flag.String("new-username", "sam", "the newly signed-up persona's username")
	flag.Parse()

	if err = guardSeedPassword(c.Environment, *password); err != nil {
		log.Fatalf("Validate seed password: %v", err)
	}

	// One transaction for the truncate and every insert: a failure at any
	// point leaves the previous data in place rather than a truncated,
	// half-seeded database.
	ctx := context.Background()
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("Begin seed transaction: %v", err)
	}
	exec := bob.NewTx(tx)

	if err = truncateDatabase(ctx, exec); err != nil {
		log.Fatalf("Truncate database before seeding: %v", err)
	}

	f := factory.NewFactoryExec(exec)
	active, newlySignedUp := seedPersonas(exec, f, personaConfig{
		active: factory.SeedUser{
			Email:    *email,
			Password: *password,
			Name:     *name,
			Username: *username,
		},
		new: factory.SeedUser{
			Email:    *newEmail,
			Password: *password,
			Name:     *newName,
			Username: *newUsername,
		},
	})

	if err = tx.Commit(); err != nil {
		log.Fatalf("Commit seed transaction: %v", err)
	}
	log.Printf("Seeded active persona %s (%s) and new persona %s (%s)", active.FullNameSearch, *email, newlySignedUp.FullNameSearch, *newEmail)
}

func seedPersonas(exec bob.Executor, f *factory.Factory, config personaConfig) (*models.User, *models.User) {
	config.active.CreatedAt = f.Now().Add(-activeAccountAge)
	active := f.Seed(factory.SeedParams{
		User:                      &config.active,
		ExerciseCount:             exerciseCount,
		RoutineCount:              routineCount,
		WorkoutCount:              activeWorkoutCount,
		WorkoutExerciseCount:      workoutExerciseCount,
		WorkoutSetsPerExerciseMin: workoutSetsMin,
		WorkoutSetsPerExerciseMax: workoutSetsMax,
		WorkoutCommentCount:       workoutCommentCount,
		WorkoutInterval:           activeWorkoutInterval,
	})

	f.Seed(factory.SeedParams{
		UserCount:                 backgroundUserCount,
		ExerciseCount:             exerciseCount,
		RoutineCount:              routineCount,
		WorkoutCount:              backgroundWorkoutCount,
		WorkoutExerciseCount:      workoutExerciseCount,
		WorkoutSetsPerExerciseMin: workoutSetsMin,
		WorkoutSetsPerExerciseMax: workoutSetsMax,
		WorkoutCommentCount:       workoutCommentCount,
		WorkoutInterval:           backgroundWorkoutInterval,
		WorkoutStagger:            backgroundWorkoutStagger,
	})

	newAuth := f.NewAuth(
		factory.AuthEmailVerified(),
		factory.AuthEmail(config.new.Email),
		factory.AuthPassword(config.new.Password),
	)
	newlySignedUp := f.NewUser(
		factory.UserAuthID(newAuth.ID),
		factory.UserName(config.new.Name),
		factory.UserUsername(config.new.Username),
	)

	jane := seedJaneDoe(exec, f, active)
	seedActiveSocialGraph(exec, active, newlySignedUp, jane)
	return active, newlySignedUp
}

func truncateDatabase(ctx context.Context, exec bob.Executor) error {
	const query = `
DO $$
DECLARE
    tables_to_truncate TEXT;
BEGIN
    SELECT STRING_AGG(FORMAT('%I.%I', schemaname, tablename), ', ')
    INTO tables_to_truncate
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> 'schema_migrations';

    IF tables_to_truncate IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
    END IF;
END $$;`

	if _, err := exec.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("truncate public schema: %w", err)
	}

	return nil
}

func seedJaneDoe(exec bob.Executor, f *factory.Factory, active *models.User) *models.User {
	jane := f.NewUser(
		factory.UserName("Jane Doe"),
		factory.UserUsername("janedoe"),
		factory.UserWeightUnit(weightunit.Pounds),
	)
	insertFollow(exec, active, jane)

	squat := f.NewExercise(
		factory.ExerciseUserID(jane.ID),
		factory.ExerciseTitle("Back Squat"),
		factory.ExerciseTags("Lower body", "Compound"),
	)
	bench := f.NewExercise(
		factory.ExerciseUserID(jane.ID),
		factory.ExerciseTitle("Bench Press"),
		factory.ExerciseTags("Upper body", "Push"),
	)
	rdl := f.NewExercise(
		factory.ExerciseUserID(jane.ID),
		factory.ExerciseTitle("Romanian Deadlift"),
		factory.ExerciseTags("Lower body", "Hinge"),
	)
	pulldown := f.NewExercise(
		factory.ExerciseUserID(jane.ID),
		factory.ExerciseTitle("Lat Pulldown"),
		factory.ExerciseTags("Upper body", "Pull"),
	)

	type workoutSet struct {
		exercise *models.Exercise
		weight   float64
		reps     int
	}
	type workoutSeed struct {
		name       string
		note       string
		finishedAt time.Time
		sets       []workoutSet
	}

	now := factory.Now()
	workouts := []workoutSeed{
		{
			name:       "Lower Body Strength",
			note:       "Squats felt strong today.",
			finishedAt: now.Add(-18 * time.Hour),
			sets: []workoutSet{
				{exercise: squat, weight: 55, reps: 8},
				{exercise: squat, weight: 60, reps: 6},
				{exercise: squat, weight: 60, reps: 6},
				{exercise: rdl, weight: 45, reps: 10},
				{exercise: rdl, weight: 50, reps: 8},
				{exercise: rdl, weight: 50, reps: 8},
			},
		},
		{
			name:       "Upper Body",
			note:       "Steady session before work.",
			finishedAt: now.Add(-48 * time.Hour),
			sets: []workoutSet{
				{exercise: bench, weight: 35, reps: 10},
				{exercise: bench, weight: 40, reps: 8},
				{exercise: bench, weight: 40, reps: 8},
				{exercise: pulldown, weight: 42.5, reps: 10},
				{exercise: pulldown, weight: 45, reps: 8},
				{exercise: pulldown, weight: 47.5, reps: 8},
			},
		},
		{
			name:       "Full Body",
			note:       "A quick full-body session.",
			finishedAt: now.Add(-96 * time.Hour),
			sets: []workoutSet{
				{exercise: squat, weight: 50, reps: 8},
				{exercise: squat, weight: 55, reps: 6},
				{exercise: squat, weight: 55, reps: 6},
				{exercise: bench, weight: 35, reps: 8},
				{exercise: bench, weight: 37.5, reps: 8},
				{exercise: bench, weight: 37.5, reps: 7},
				{exercise: rdl, weight: 40, reps: 10},
				{exercise: rdl, weight: 45, reps: 10},
				{exercise: rdl, weight: 45, reps: 8},
				{exercise: pulldown, weight: 37.5, reps: 10},
				{exercise: pulldown, weight: 40, reps: 10},
				{exercise: pulldown, weight: 42.5, reps: 8},
			},
		},
	}

	for _, seededWorkout := range workouts {
		startedAt := seededWorkout.finishedAt.Add(-45 * time.Minute)
		workout := f.NewWorkout(
			factory.WorkoutUserID(jane.ID),
			factory.WorkoutName(seededWorkout.name),
			factory.WorkoutNote(seededWorkout.note),
			factory.WorkoutStartedAt(startedAt),
			factory.WorkoutFinishedAt(seededWorkout.finishedAt),
			factory.WorkoutCreatedAt(seededWorkout.finishedAt),
		)

		setBatch := make([][]factory.SetOpt, 0, len(seededWorkout.sets))
		for index, seededSet := range seededWorkout.sets {
			setBatch = append(setBatch, []factory.SetOpt{
				factory.SetUserID(jane.ID),
				factory.SetWorkoutID(workout.ID),
				factory.SetExerciseID(seededSet.exercise.ID),
				factory.SetWeight(seededSet.weight),
				factory.SetReps(seededSet.reps),
				factory.SetCreatedAt(startedAt.Add(time.Duration(index+1) * 3 * time.Minute)),
			})
		}
		f.NewSetBatch(setBatch...)
	}

	seedJaneComments(exec, f, active, jane, now)
	return jane
}

func seedActiveSocialGraph(exec bob.Executor, active, newlySignedUp, jane *models.User) {
	users, err := models.Users.Query().All(context.Background(), exec)
	if err != nil {
		panic(fmt.Errorf("retrieve users for active persona social graph: %w", err))
	}

	var peers models.UserSlice
	for _, user := range users {
		if user.ID != active.ID && user.ID != newlySignedUp.ID && user.ID != jane.ID {
			peers = append(peers, user)
		}
	}
	if len(peers) < 4 {
		panic(fmt.Errorf("active persona social graph needs at least 4 peers, got %d", len(peers))) //nolint:err113
	}

	for _, followee := range peers[:2] {
		insertFollow(exec, active, followee)
	}
	insertFollow(exec, jane, active)
	for _, follower := range peers[2:4] {
		insertFollow(exec, follower, active)
	}
}

func insertFollow(exec bob.Executor, follower, followee *models.User) {
	if _, err := models.Followers.Insert(&models.FollowerSetter{
		FollowerID: omit.From(follower.ID),
		FolloweeID: omit.From(followee.ID),
	}).Exec(context.Background(), exec); err != nil {
		panic(fmt.Errorf("follow operation from %s to %s: %w", follower.FullNameSearch, followee.FullNameSearch, err))
	}
}

func seedJaneComments(exec bob.Executor, f *factory.Factory, active, jane *models.User, now time.Time) {
	activeWorkouts, err := models.Workouts.Query(
		models.SelectWhere.Workouts.UserID.EQ(active.ID),
	).All(context.Background(), exec)
	if err != nil {
		panic(fmt.Errorf("retrieve active persona workouts for Jane Doe comments: %w", err))
	}

	type commentSeed struct {
		text      string
		createdAt time.Time
		read      bool
	}
	comments := []commentSeed{
		{text: "Strong session — those last sets looked solid!", createdAt: now.Add(-22 * time.Minute)},
		{text: "Nice work! That volume is really adding up.", createdAt: now.Add(-3 * time.Hour)},
		{text: "Great consistency. How did the final set feel?", createdAt: now.Add(-26 * time.Hour), read: true},
		{text: "Another strong workout in the books!", createdAt: now.Add(-50 * time.Hour), read: true},
	}

	for index, seededComment := range comments {
		if index >= len(activeWorkouts) {
			break
		}

		workout := activeWorkouts[index]
		f.NewWorkoutComment(
			factory.WorkoutCommentUserID(jane.ID),
			factory.WorkoutCommentWorkoutID(workout.ID),
			factory.WorkoutCommentText(seededComment.text),
			factory.WorkoutCommentCreatedAt(seededComment.createdAt),
		)
		notificationOpts := []factory.NotificationOpt{
			factory.NotificationUserID(active.ID),
			factory.NotificationType(notification.TypeWorkoutComment),
			factory.NotificationPayload(notification.Payload{
				ActorID:   jane.ID.String(),
				WorkoutID: workout.ID.String(),
			}),
			factory.NotificationCreatedAt(seededComment.createdAt),
		}
		if seededComment.read {
			notificationOpts = append(notificationOpts, factory.NotificationRead())
		}
		f.NewNotification(notificationOpts...)
	}
}
