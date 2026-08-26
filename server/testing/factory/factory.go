//nolint:all
package factory

import (
	"database/sql"
	"fmt"
	"math/rand"
	"strings"
	"sync/atomic"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/gofrs/uuid/v5"
	"github.com/stephenafamo/bob"

	bobfactory "github.com/crlssn/getstronger/server/gen/factory"
	"github.com/crlssn/getstronger/server/gen/models"
)

type Factory struct {
	Faker *gofakeit.Faker

	generated *bobfactory.Factory
	exec      bob.Executor
	now       time.Time
	userCount atomic.Int64
}

// usernameMaxLength mirrors users.username, which is VARCHAR(30).
const usernameMaxLength = 30

// nextUsername generates a faker-flavoured username that a counter keeps
// unique: usernames are unique case-insensitively at the database level. Faker
// names run to fifty characters, so the name is trimmed to leave room for the
// counter rather than the insert failing on the column width.
func (f *Factory) nextUsername() string {
	suffix := fmt.Sprintf(".%d", f.userCount.Add(1))
	name := []rune(strings.ToLower(f.Faker.Username()))
	if room := usernameMaxLength - len(suffix); len(name) > room {
		name = name[:room]
	}

	return string(name) + suffix
}

func newUUID() uuid.UUID {
	return uuid.Must(uuid.NewV4())
}

func nativeUUID(value any) uuid.UUID {
	switch value := value.(type) {
	case uuid.UUID:
		return value
	case string:
		return uuid.FromStringOrNil(value)
	default:
		panic(fmt.Sprintf("unsupported UUID value %T", value))
	}
}

func NewFactory(db *sql.DB) *Factory {
	return NewFactoryExec(bob.NewDB(db))
}

// NewFactoryExec builds a factory over any Bob executor, which is what lets
// the seed run its truncate and every insert inside one transaction.
func NewFactoryExec(exec bob.Executor) *Factory {
	return &Factory{
		generated: bobfactory.New(),
		exec:      exec,
		Faker:     gofakeit.New(0),
	}
}

// Bob's WithExisting mods copy loaded relationships recursively. Strip the
// relationship cache so bidirectional models cannot recurse into each other.
func authWithoutRelationships(model *models.Auth) *models.Auth {
	copy := *model
	copy.R = models.Auth{}.R
	return &copy
}

func userWithoutRelationships(model *models.User) *models.User {
	copy := *model
	copy.R = models.User{}.R
	return &copy
}

func routineWithoutRelationships(model *models.Routine) *models.Routine {
	copy := *model
	copy.R = models.Routine{}.R
	return &copy
}

func routineGroupWithoutRelationships(model *models.RoutineGroup) *models.RoutineGroup {
	copy := *model
	copy.R = models.RoutineGroup{}.R
	return &copy
}

func exerciseWithoutRelationships(model *models.Exercise) *models.Exercise {
	copy := *model
	copy.R = models.Exercise{}.R
	return &copy
}

func workoutWithoutRelationships(model *models.Workout) *models.Workout {
	copy := *model
	copy.R = models.Workout{}.R
	return &copy
}

type SeedUser struct {
	Email     string
	Password  string
	Name      string
	Username  string
	CreatedAt time.Time
}

type SeedParams struct {
	User                      *SeedUser
	UserCount                 int
	ExerciseCount             int
	RoutineCount              int
	WorkoutCount              int
	WorkoutExerciseCount      int
	WorkoutSetCount           int
	WorkoutSetsPerExerciseMin int
	WorkoutSetsPerExerciseMax int
	WorkoutCommentCount       int
	WorkoutInterval           time.Duration
}

func (f *Factory) Seed(p SeedParams) *models.User {
	var primaryUser *models.User
	if p.User != nil {
		auth := f.NewAuth(
			AuthEmailVerified(),
			AuthEmail(p.User.Email),
			AuthPassword(p.User.Password),
		)
		userOpts := []UserOpt{
			UserAuthID(auth.ID),
			UserName(p.User.Name),
		}
		if p.User.Username != "" {
			userOpts = append(userOpts, UserUsername(p.User.Username))
		}
		if !p.User.CreatedAt.IsZero() {
			userOpts = append(userOpts, UserCreatedAt(p.User.CreatedAt))
		}
		primaryUser = f.NewUser(userOpts...)
		f.seedUser(p, primaryUser)
	}

	for range p.UserCount {
		auth := f.NewAuth(AuthEmailVerified())
		user := f.NewUser(UserAuthID(auth.ID))
		f.seedUser(p, user)
	}

	return primaryUser
}

func (f *Factory) seedUser(p SeedParams, user *models.User) {
	titles := uniqueExerciseTitles(p.ExerciseCount)
	var exercises models.ExerciseSlice
	for index := range p.ExerciseCount {
		exercises = append(exercises, f.NewExercise(ExerciseUserID(user.ID), ExerciseTitle(titles[index])))
	}

	for range p.RoutineCount {
		routine := f.NewRoutine(RoutineUserID(user.ID))
		f.AddRoutineExercise(routine, randomExercises(exercises)...)
	}

	for workoutIndex := range p.WorkoutCount {
		workoutOpts := []WorkoutOpt{WorkoutUserID(user.ID)}
		var startedAt time.Time
		if p.WorkoutInterval > 0 {
			startedAt = f.Now().Add(-time.Hour).Add(-time.Duration(workoutIndex) * p.WorkoutInterval)
			workoutOpts = append(
				workoutOpts,
				WorkoutStartedAt(startedAt),
				WorkoutFinishedAt(startedAt.Add(time.Hour)),
				WorkoutCreatedAt(startedAt),
			)
		}
		workout := f.NewWorkout(workoutOpts...)
		setIndex := 0

		if p.WorkoutExerciseCount > 0 && p.WorkoutSetsPerExerciseMin > 0 &&
			p.WorkoutSetsPerExerciseMax >= p.WorkoutSetsPerExerciseMin {
			for _, exercise := range randomExerciseSubset(exercises, p.WorkoutExerciseCount) {
				setCount := randomIntBetween(
					p.WorkoutSetsPerExerciseMin,
					p.WorkoutSetsPerExerciseMax,
				)
				for range setCount {
					setOpts := []SetOpt{
						SetUserID(user.ID),
						SetWorkoutID(workout.ID),
						SetExerciseID(exercise.ID),
					}
					if !startedAt.IsZero() {
						setIndex++
						setOpts = append(setOpts, SetCreatedAt(startedAt.Add(time.Duration(setIndex)*time.Minute)))
					}
					f.NewSet(
						setOpts...,
					)
				}
			}
		} else {
			for range p.WorkoutSetCount {
				f.NewSet(
					SetUserID(user.ID),
					SetWorkoutID(workout.ID),
					SetExerciseID(randomExercise(exercises).ID),
				)
			}
		}

		for range p.WorkoutCommentCount {
			f.NewWorkoutComment(
				WorkoutCommentUserID(user.ID),
				WorkoutCommentWorkoutID(workout.ID),
			)
		}
	}
}

// Now stays fixed regardless how many times it's called.
func (f *Factory) Now() time.Time {
	if f.now.IsZero() {
		f.now = Now()
		return f.now
	}

	return f.now
}

func Now() time.Time {
	// Truncate to microseconds to unify precision across different databases.
	return time.Now().UTC().Round(time.Microsecond)
}

// A title is what an exercise is called by, on screen and in a test that looks
// for one. Drawing each independently gave a seeded library three exercises
// called "Bench Press" and nothing to tell them apart, so a library hands its
// titles out once, numbering the repeats it cannot avoid.
func uniqueExerciseTitles(count int) []string {
	pool := exerciseTitles()
	rand.Shuffle(len(pool), func(i, j int) {
		pool[i], pool[j] = pool[j], pool[i]
	})

	titles := make([]string, 0, count)
	for index := range count {
		title := pool[index%len(pool)]
		if round := index / len(pool); round > 0 {
			title = fmt.Sprintf("%s %d", title, round+1)
		}
		titles = append(titles, title)
	}

	return titles
}

func randomExercise(slice models.ExerciseSlice) *models.Exercise {
	rand.Shuffle(len(slice), func(i, j int) {
		slice[i], slice[j] = slice[j], slice[i]
	})

	return slice[0]
}

func randomExercises(slice models.ExerciseSlice) models.ExerciseSlice {
	rand.Shuffle(len(slice), func(i, j int) {
		slice[i], slice[j] = slice[j], slice[i]
	})

	length := rand.Intn(len(slice)) + 1

	return slice[:length]
}

func randomExerciseSubset(slice models.ExerciseSlice, count int) models.ExerciseSlice {
	rand.Shuffle(len(slice), func(i, j int) {
		slice[i], slice[j] = slice[j], slice[i]
	})

	return slice[:min(count, len(slice))]
}

func randomIntBetween(minimum, maximum int) int {
	return minimum + rand.Intn(maximum-minimum+1)
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
