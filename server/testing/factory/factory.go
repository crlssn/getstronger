//nolint:all
package factory

import (
	"database/sql"
	"fmt"
	"math/rand"
	"strings"

	"github.com/brianvoe/gofakeit/v7"

	"github.com/crlssn/getstronger/server/gen/orm"
)

type Factory struct {
	db    *sql.DB
	faker *gofakeit.Faker
}

func NewFactory(db *sql.DB) *Factory {
	return &Factory{
		db:    db,
		faker: gofakeit.New(0),
	}
}

type SeedUser struct {
	Email     string
	Password  string
	FirstName string
	LastName  string
}

type SeedParams struct {
	User                *SeedUser
	UserCount           int
	ExerciseCount       int
	RoutineCount        int
	WorkoutCount        int
	WorkoutSetCount     int
	WorkoutCommentCount int
}

func (f *Factory) Seed(p SeedParams) {
	if p.User != nil {
		auth := f.NewAuth(
			AuthEmailVerified(),
			AuthEmail(p.User.Email),
			AuthPassword(p.User.Password),
		)
		user := f.NewUser(
			UserAuthID(auth.ID),
			UserFirstName(p.User.FirstName),
			UserLastName(p.User.LastName),
		)
		f.seedUser(p, user)
	}

	for range p.UserCount {
		auth := f.NewAuth(AuthEmailVerified())
		user := f.NewUser(UserAuthID(auth.ID))
		f.seedUser(p, user)
	}
}

func (f *Factory) seedUser(p SeedParams, user *orm.User) {
	var exercises orm.ExerciseSlice
	for range p.ExerciseCount {
		exercises = append(exercises, f.NewExercise(ExerciseUserID(user.ID)))
	}

	for range p.RoutineCount {
		routine := f.NewRoutine(RoutineUserID(user.ID))
		f.AddRoutineExercise(routine, randomExercises(exercises)...)
	}

	for range p.WorkoutCount {
		workout := f.NewWorkout(WorkoutUserID(user.ID))

		for range p.WorkoutSetCount {
			f.NewSet(
				SetUserID(user.ID),
				SetWorkoutID(workout.ID),
				SetExerciseID(randomExercise(exercises).ID),
			)
		}

		for range p.WorkoutCommentCount {
			f.NewWorkoutComment(
				WorkoutCommentUserID(user.ID),
				WorkoutCommentWorkoutID(workout.ID),
			)
		}
	}
}

func randomExercise(slice orm.ExerciseSlice) *orm.Exercise {
	rand.Shuffle(len(slice), func(i, j int) {
		slice[i], slice[j] = slice[j], slice[i]
	})

	return slice[0]
}

func randomExercises(slice orm.ExerciseSlice) orm.ExerciseSlice {
	rand.Shuffle(len(slice), func(i, j int) {
		slice[i], slice[j] = slice[j], slice[i]
	})

	length := rand.Intn(len(slice)) + 1

	return slice[:length]
}

// UUID generates a UUID populated exclusively by the given digit which can be useful during debugging.
func UUID(digit int) string {
	if digit < 0 || digit > 9 {
		panic("digit must be between 0 and 9")
	}

	digitStr := fmt.Sprintf("%d", digit)
	return strings.Join([]string{
		strings.Repeat(digitStr, 8),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 12),
	}, "-")
}
