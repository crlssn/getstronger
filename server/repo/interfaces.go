package repo

import (
	"context"
	"database/sql"

	"github.com/crlssn/getstronger/server/gen/orm"
)

//go:generate mockgen -package mock_repo -source=interfaces.go -destination=mocks/mock_repo.go Repo
type Repo interface {
	methods
	NewTx(ctx context.Context, f func(tx Tx) error) error
}

type Tx interface {
	methods
	GetTx() *sql.Tx
}

type methods interface {
	setMethods
	authMethods
	userMethods
	traceMethods
	pubSubMethods
	routineMethods
	workoutMethods
	exerciseMethods
	notificationMethods
}

type setMethods interface {
	ListSets(ctx context.Context, opts ...ListSetsOpt) (orm.SetSlice, error)
	GetPersonalBests(ctx context.Context, userID string) (orm.SetSlice, error)
	GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (orm.SetSlice, error)
}

type authMethods interface {
	GetAuth(ctx context.Context, opts ...GetAuthOpt) (*orm.Auth, error)
	CreateAuth(ctx context.Context, email, password string) (*orm.Auth, error)
	UpdateAuth(ctx context.Context, authID string, opts ...UpdateAuthOpt) error
	RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error)
	CompareEmailAndPassword(ctx context.Context, email, password string) error
}

type userMethods interface {
	Follow(ctx context.Context, p FollowParams) error
	GetUser(ctx context.Context, opts ...GetUserOpt) (*orm.User, error)
	Unfollow(ctx context.Context, p UnfollowParams) error
	ListUsers(ctx context.Context, opts ...ListUsersOpt) (orm.UserSlice, error)
	CreateUser(ctx context.Context, p CreateUserParams) (*orm.User, error)
	ListFollowers(ctx context.Context, userID string, opts ...ListFollowersOpt) (orm.UserSlice, error)
	ListFollowees(ctx context.Context, userID string, opts ...ListFolloweesOpt) (orm.UserSlice, error)
	IsUserFollowedByUserID(ctx context.Context, user *orm.User, userID string) (bool, error)
}

type traceMethods interface {
	StoreTrace(ctx context.Context, p StoreTraceParams) error
}

type routineMethods interface {
	GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*orm.Routine, error)
	ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (orm.RoutineSlice, error)
	CreateRoutine(ctx context.Context, p CreateRoutineParams) (*orm.Routine, error)
	DeleteRoutine(ctx context.Context, routineID string) error
	UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error
	SetRoutineExercises(ctx context.Context, routine *orm.Routine, exercises orm.ExerciseSlice) error
	AddExerciseToRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error
	RemoveExerciseFromRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error
}

type workoutMethods interface {
	GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*orm.Workout, error)
	ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (orm.WorkoutSlice, error)
	CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*orm.Workout, error)
	DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error
	UpdateWorkout(ctx context.Context, workoutID string, opts ...UpdateWorkoutOpt) error
	GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*orm.WorkoutComment, error)
	UpdateWorkoutSets(ctx context.Context, workoutID string, exerciseSets []ExerciseSet) error
	CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams) (*orm.WorkoutComment, error)
}

type exerciseMethods interface {
	GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*orm.Exercise, error)
	ListExercises(ctx context.Context, opts ...ListExercisesOpt) (orm.ExerciseSlice, error)
	CreateExercise(ctx context.Context, p CreateExerciseParams) (*orm.Exercise, error)
	UpdateExercise(ctx context.Context, exerciseID string, opts ...UpdateExerciseOpt) error
	SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error
}

type notificationMethods interface {
	ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) (orm.NotificationSlice, error)
	CreateNotification(ctx context.Context, p CreateNotificationParams) error
	CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error)
	MarkNotificationsAsRead(ctx context.Context, userID string) error
}

type pubSubMethods interface {
	PublishEvent(ctx context.Context, topic orm.EventTopic, payload []byte) error
}
