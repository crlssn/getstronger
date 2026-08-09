package repo

import (
	"context"
	"database/sql"

	"github.com/stephenafamo/bob"

	"github.com/crlssn/getstronger/server/gen/models"
)

//go:generate mockgen -package repo -source=interfaces.go -destination=interfaces_mock.go Repo
type Repo interface {
	methods
	NewTx(ctx context.Context, f func(tx Tx) error) error
}

type Tx interface {
	methods
	exec() *sql.Tx
	bobExec() bob.Executor
}

type methods interface {
	setMethods
	authMethods
	userMethods
	traceMethods
	pubSubMethods
	routineMethods
	planMethods
	workoutMethods
	exerciseMethods
	notificationMethods
}

type planMethods interface { //nolint:interfacebloat // Plan operations form one cohesive transactional capability.
	validatePlanRoutines(ctx context.Context, userID string, routineIDs []string) error
	replacePlanRoutines(ctx context.Context, planID string, routineIDs []string) error
	CreatePlan(ctx context.Context, p CreatePlanParams) (*TrainingPlan, error)
	GetPlan(ctx context.Context, planID, userID string) (*TrainingPlan, error)
	GetActivePlan(ctx context.Context, userID string) (*TrainingPlan, error)
	ListPlans(ctx context.Context, userID string) ([]*TrainingPlan, error)
	UpdatePlan(ctx context.Context, p UpdatePlanParams) (*TrainingPlan, error)
	DeletePlan(ctx context.Context, planID, userID string) error
	SetActivePlan(ctx context.Context, planID, userID string) (*TrainingPlan, error)
	PauseActivePlan(ctx context.Context, userID string) error
	AdvancePlan(ctx context.Context, planID, userID, expectedRoutineID string) (*TrainingPlan, error)
}

type setMethods interface {
	ListSets(ctx context.Context, opts ...ListSetsOpt) (models.SetSlice, error)
	GetPersonalBests(ctx context.Context, userIDs ...string) (models.SetSlice, error)
	GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (models.SetSlice, error)
}

type authMethods interface {
	GetAuth(ctx context.Context, opts ...GetAuthOpt) (*models.Auth, error)
	CreateAuth(ctx context.Context, email, password string) (*models.Auth, error)
	UpdateAuth(ctx context.Context, authID string, opts ...UpdateAuthOpt) error
	RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error)
	CompareEmailAndPassword(ctx context.Context, email, password string) error
}

type userMethods interface {
	Follow(ctx context.Context, p FollowParams) error
	GetUser(ctx context.Context, opts ...GetUserOpt) (*models.User, error)
	Unfollow(ctx context.Context, p UnfollowParams) error
	ListUsers(ctx context.Context, opts ...ListUsersOpt) (models.UserSlice, error)
	CreateUser(ctx context.Context, p CreateUserParams) (*models.User, error)
	ListFollowers(ctx context.Context, userID string, opts ...ListFollowersOpt) (models.UserSlice, error)
	ListFollowees(ctx context.Context, userID string, opts ...ListFolloweesOpt) (models.UserSlice, error)
	IsUserFollowedByUserID(ctx context.Context, user *models.User, userID string) (bool, error)
}

type traceMethods interface {
	StoreTrace(ctx context.Context, p StoreTraceParams) error
}

type routineMethods interface {
	GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*models.Routine, error)
	ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (models.RoutineSlice, error)
	CreateRoutine(ctx context.Context, p CreateRoutineParams) (*models.Routine, error)
	DeleteRoutine(ctx context.Context, routineID string) error
	UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error
	SetRoutineExercises(ctx context.Context, routine *models.Routine, exercises models.ExerciseSlice) error
	AddExerciseToRoutine(ctx context.Context, exercise *models.Exercise, routine *models.Routine) error
	RemoveExerciseFromRoutine(ctx context.Context, exercise *models.Exercise, routine *models.Routine) error
}

type workoutMethods interface {
	GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*models.Workout, error)
	ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (models.WorkoutSlice, error)
	CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*models.Workout, error)
	DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error
	UpdateWorkout(ctx context.Context, workoutID string, opts ...UpdateWorkoutOpt) error
	GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*models.WorkoutComment, error)
	UpdateWorkoutSets(ctx context.Context, p UpdateWorkoutSetsParams) error
	CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams, opts ...CreateWorkoutCommentOpts) (*models.WorkoutComment, error)
	PostCreateWorkoutCommentLoadUser(ctx context.Context) CreateWorkoutCommentOpts
}

type exerciseMethods interface {
	GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*models.Exercise, error)
	ListExercises(ctx context.Context, opts ...ListExercisesOpt) (models.ExerciseSlice, error)
	CreateExercise(ctx context.Context, p CreateExerciseParams) (*models.Exercise, error)
	UpdateExercise(ctx context.Context, exerciseID string, opts ...UpdateExerciseOpt) error
	SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error
}

type notificationMethods interface {
	ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) (models.NotificationSlice, error)
	CreateNotification(ctx context.Context, p CreateNotificationParams) error
	CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error)
	MarkNotificationsAsRead(ctx context.Context, userID string) error
}

type pubSubMethods interface {
	PublishEvent(ctx context.Context, topic EventTopic, payload []byte) error
}
