//nolint:all
package factory

import (
	"context"
	"database/sql"
	"fmt"
	"math/rand"
	"strings"
	"sync"
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

	// created remembers every row this factory inserted, so a child fixture
	// reuses a parent it just made instead of paying a query to re-read it.
	// The seed runs over a WAN, where those queries dominated its runtime.
	createdMu sync.Mutex
	created   map[uuid.UUID]any
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
		created:   map[uuid.UUID]any{},
	}
}

func (f *Factory) remember(id uuid.UUID, model any) {
	f.createdMu.Lock()
	defer f.createdMu.Unlock()
	f.created[id] = model
}

// createdModel returns the remembered model for id when it is a T.
func createdModel[T any](f *Factory, id uuid.UUID) (T, bool) {
	f.createdMu.Lock()
	defer f.createdMu.Unlock()
	model, ok := f.created[id].(T)
	return model, ok
}

func (f *Factory) mustUser(id uuid.UUID) *models.User {
	if user, ok := createdModel[*models.User](f, id); ok {
		return user
	}
	user, err := models.Users.Query(models.SelectWhere.Users.ID.EQ(id)).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("retrieve user: %w", err))
	}
	return user
}

func (f *Factory) mustAuth(id uuid.UUID) *models.Auth {
	if auth, ok := createdModel[*models.Auth](f, id); ok {
		return auth
	}
	auth, err := models.Auths.Query(models.SelectWhere.Auths.ID.EQ(id)).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("retrieve auth: %w", err))
	}
	return auth
}

func (f *Factory) mustWorkout(id uuid.UUID) *models.Workout {
	if workout, ok := createdModel[*models.Workout](f, id); ok {
		return workout
	}
	workout, err := models.Workouts.Query(models.SelectWhere.Workouts.ID.EQ(id)).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("retrieve workout: %w", err))
	}
	return workout
}

func (f *Factory) mustExercise(id uuid.UUID) *models.Exercise {
	if exercise, ok := createdModel[*models.Exercise](f, id); ok {
		return exercise
	}
	exercise, err := models.Exercises.Query(models.SelectWhere.Exercises.ID.EQ(id)).One(context.Background(), f.exec)
	if err != nil {
		panic(fmt.Errorf("retrieve exercise: %w", err))
	}
	return exercise
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
	// How far each seeded account's history sits behind the previous one.
	WorkoutStagger time.Duration
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
		f.seedUserAt(p, primaryUser, 0)
	}

	// Staggered, so a feed of several seeded accounts does not land every one
	// of their workouts on the same timestamp.
	for index := range p.UserCount {
		auth := f.NewAuth(AuthEmailVerified())
		user := f.NewUser(UserAuthID(auth.ID))
		f.seedUserAt(p, user, index)
	}

	return primaryUser
}

func (f *Factory) seedUserAt(p SeedParams, user *models.User, userIndex int) {
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
			startedAt = f.Now().
				Add(-time.Hour).
				Add(-time.Duration(workoutIndex) * p.WorkoutInterval).
				Add(-time.Duration(userIndex) * p.WorkoutStagger)
			workoutOpts = append(
				workoutOpts,
				WorkoutStartedAt(startedAt),
				WorkoutFinishedAt(startedAt.Add(time.Hour)),
				WorkoutCreatedAt(startedAt),
			)
		}
		workout := f.NewWorkout(workoutOpts...)
		setIndex := 0

		// One batched insert per workout rather than one per set.
		var setBatch [][]SetOpt
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
					setBatch = append(setBatch, setOpts)
				}
			}
		} else {
			for range p.WorkoutSetCount {
				setBatch = append(setBatch, []SetOpt{
					SetUserID(user.ID),
					SetWorkoutID(workout.ID),
					SetExerciseID(randomExercise(exercises).ID),
				})
			}
		}
		f.NewSetBatch(setBatch...)

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
func UUID(digit int) uuid.UUID {
	if digit < 0 || digit > 9 {
		panic("digit must be between 0 and 9")
	}

	digitStr := fmt.Sprintf("%d", digit)
	return uuid.FromStringOrNil(strings.Join([]string{
		strings.Repeat(digitStr, 8),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 4),
		strings.Repeat(digitStr, 12),
	}, "-"))
}
