package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"log"
	"slices"
	"time"

	"github.com/joho/godotenv"

	"github.com/aarondl/opt/omit"
	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/db"
	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/factory"
)

const (
	userCount            = 10
	exerciseCount        = 10
	routineCount         = 5
	workoutCount         = 5
	workoutExerciseCount = 5
	workoutSetsMin       = 3
	workoutSetsMax       = 6
	workoutCommentCount  = 2
)

func main() {
	if err := godotenv.Load(); err != nil {
		panic(fmt.Errorf("failed to load .env file: %w", err))
	}

	c := config.New()
	if c.Environment != config.EnvironmentLocal {
		log.Printf("environment must be local, got %s", c.Environment)
		return
	}

	database, err := db.New(c)
	if err != nil {
		log.Printf("failed to connect to database: %v", err)
		return
	}

	email := flag.String("email", "", "the user's email")
	password := flag.String("password", "", "the user's password")
	firstname := flag.String("firstname", "", "the user's first name")
	lastname := flag.String("lastname", "", "the user's last name")
	flag.Parse()

	if err = truncateDatabase(context.Background(), database); err != nil {
		log.Printf("failed to truncate database before seeding: %v", err)
		return
	}

	var user *factory.SeedUser
	if !empty(*email, *password, *firstname, *lastname) {
		user = &factory.SeedUser{
			Email:     *email,
			Password:  *password,
			FirstName: *firstname,
			LastName:  *lastname,
		}
	}

	f := factory.NewFactory(database)
	john := f.Seed(factory.SeedParams{
		User:                      user,
		UserCount:                 userCount,
		ExerciseCount:             exerciseCount,
		RoutineCount:              routineCount,
		WorkoutCount:              workoutCount,
		WorkoutExerciseCount:      workoutExerciseCount,
		WorkoutSetsPerExerciseMin: workoutSetsMin,
		WorkoutSetsPerExerciseMax: workoutSetsMax,
		WorkoutCommentCount:       workoutCommentCount,
	})

	if john != nil {
		seedJaneDoe(database, f, john, *password)
	}
}

func truncateDatabase(ctx context.Context, database *sql.DB) error {
	const query = `
DO $$
DECLARE
    tables_to_truncate TEXT;
BEGIN
    SELECT STRING_AGG(FORMAT('%I.%I', schemaname, tablename), ', ')
    INTO tables_to_truncate
    FROM pg_tables
    WHERE schemaname = 'getstronger';

    IF tables_to_truncate IS NOT NULL THEN
        EXECUTE 'TRUNCATE TABLE ' || tables_to_truncate || ' RESTART IDENTITY CASCADE';
    END IF;
END $$;`

	if _, err := database.ExecContext(ctx, query); err != nil {
		return fmt.Errorf("truncate getstronger schema: %w", err)
	}

	return nil
}

func seedJaneDoe(database *sql.DB, f *factory.Factory, john *models.User, password string) {
	auth := f.NewAuth(
		factory.AuthEmailVerified(),
		factory.AuthEmail("jane@doe.com"),
		factory.AuthPassword(password),
	)
	jane := f.NewUser(
		factory.UserAuthID(auth.ID),
		factory.UserFirstName("Jane"),
		factory.UserLastName("Doe"),
	)

	if _, err := models.Followers.Insert(&models.FollowerSetter{
		FollowerID: omit.From(john.ID),
		FolloweeID: omit.From(jane.ID),
	}).Exec(context.Background(), bob.NewDB(database)); err != nil {
		panic(fmt.Errorf("follow operation from John Doe to Jane Doe: %w", err))
	}

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
		exercise *orm.Exercise
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

		for index, seededSet := range seededWorkout.sets {
			f.NewSet(
				factory.SetUserID(jane.ID),
				factory.SetWorkoutID(workout.ID),
				factory.SetExerciseID(seededSet.exercise.ID),
				factory.SetWeight(seededSet.weight),
				factory.SetReps(seededSet.reps),
				factory.SetCreatedAt(startedAt.Add(time.Duration(index+1)*3*time.Minute)),
			)
		}
	}

	seedJaneComments(database, f, john, jane, now)
}

func seedJaneComments(database *sql.DB, f *factory.Factory, john, jane *models.User, now time.Time) {
	johnWorkouts, err := orm.Workouts(
		orm.WorkoutWhere.UserID.EQ(john.ID),
	).All(context.Background(), database)
	if err != nil {
		panic(fmt.Errorf("retrieve John Doe workouts for Jane Doe comments: %w", err))
	}

	type commentSeed struct {
		text      string
		createdAt time.Time
	}
	comments := []commentSeed{
		{text: "Strong session — those last sets looked solid!", createdAt: now.Add(-22 * time.Minute)},
		{text: "Nice work! That volume is really adding up.", createdAt: now.Add(-3 * time.Hour)},
		{text: "Great consistency. How did the final set feel?", createdAt: now.Add(-26 * time.Hour)},
	}

	for index, seededComment := range comments {
		if index >= len(johnWorkouts) {
			break
		}

		workout := johnWorkouts[index]
		f.NewWorkoutComment(
			factory.WorkoutCommentUserID(jane.ID),
			factory.WorkoutCommentWorkoutID(workout.ID),
			factory.WorkoutCommentText(seededComment.text),
			factory.WorkoutCommentCreatedAt(seededComment.createdAt),
		)
		f.NewNotification(
			factory.NotificationUserID(john.ID),
			factory.NotificationType(repo.NotificationTypeWorkoutComment),
			factory.NotificationPayload(repo.NotificationPayload{
				ActorID:   jane.ID,
				WorkoutID: workout.ID,
			}),
			factory.NotificationCreatedAt(seededComment.createdAt),
		)
	}
}

func empty(slice ...string) bool {
	return slices.Contains(slice, "")
}
