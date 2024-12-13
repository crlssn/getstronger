package repo

import (
	"context"
	"database/sql"

	"github.com/crlssn/getstronger/server/pkg/orm"
)

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
	routineMethods
	workoutMethods
	exerciseMethods
	notificationMethods
}

type setMethods interface {
	GetPersonalBests(ctx context.Context, userID string) (orm.SetSlice, error)
	ListSets(ctx context.Context, opts ...ListSetsOpt) (orm.SetSlice, error)
	GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (orm.SetSlice, error)
}

type authMethods interface {
	CreateAuth(ctx context.Context, email, password string) (*orm.Auth, error)
	CompareEmailAndPassword(ctx context.Context, email, password string) error
	UpdateRefreshToken(ctx context.Context, authID string, refreshToken string) error
	DeleteRefreshToken(ctx context.Context, refreshToken string) error
	RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error)
	GetAuth(ctx context.Context, opts ...GetAuthOpt) (*orm.Auth, error)
	VerifyEmail(ctx context.Context, token string) error
	SetPasswordResetToken(ctx context.Context, authID, token string) error
	UpdatePassword(ctx context.Context, authID string, password string) error
}

type userMethods interface {
	CreateUser(ctx context.Context, p CreateUserParams) (*orm.User, error)
	Follow(ctx context.Context, p FollowParams) error
	Unfollow(ctx context.Context, p UnfollowParams) error
	ListFollowers(ctx context.Context, user *orm.User, opts ...ListFollowersOpt) (orm.UserSlice, error)
	ListFollowees(ctx context.Context, user *orm.User, opts ...ListFolloweesOpt) (orm.UserSlice, error)
	GetUser(ctx context.Context, opts ...GetUserOpt) (*orm.User, error)
	ListUsers(ctx context.Context, opts ...ListUsersOpt) (orm.UserSlice, error)
	IsUserFollowedByUserID(ctx context.Context, user *orm.User, userID string) (bool, error)
}

type traceMethods interface {
	StoreTrace(ctx context.Context, p StoreTraceParams) error
}

type routineMethods interface {
	CreateRoutine(ctx context.Context, p CreateRoutineParams) (*orm.Routine, error)
	GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*orm.Routine, error)
	DeleteRoutine(ctx context.Context, id string) error
	ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (orm.RoutineSlice, error)
	UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error
	AddExerciseToRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error
	RemoveExerciseFromRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error
	SetRoutineExercises(ctx context.Context, routine *orm.Routine, exercises orm.ExerciseSlice) error
}

type workoutMethods interface {
	ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (orm.WorkoutSlice, error)
	CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*orm.Workout, error)
	GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*orm.Workout, error)
	DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error
	CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams) (*orm.WorkoutComment, error)
	GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*orm.WorkoutComment, error)
	UpdateWorkout(ctx context.Context, workoutID string, p UpdateWorkoutParams) error
}

type exerciseMethods interface {
	CreateExercise(ctx context.Context, p CreateExerciseParams) (*orm.Exercise, error)
	SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error
	ListExercises(ctx context.Context, opts ...ListExercisesOpt) (orm.ExerciseSlice, error)
	GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*orm.Exercise, error)
	UpdateExercise(ctx context.Context, exercise *orm.Exercise) error
}

type notificationMethods interface {
	CreateNotification(ctx context.Context, p CreateNotificationParams) error
	ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) (orm.NotificationSlice, error)
	CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error)
	MarkNotificationsAsRead(ctx context.Context, opts ...MarkNotificationsAsReadOpt) error
}
