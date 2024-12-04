package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"github.com/volatiletech/sqlboiler/v4/queries"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
	"github.com/volatiletech/sqlboiler/v4/types"
	"golang.org/x/crypto/bcrypt"

	orm "github.com/crlssn/getstronger/server/pkg/orm"
)

type Repo struct {
	db *sql.DB
	tx *sql.Tx
}

func New(db *sql.DB) *Repo {
	return &Repo{db, nil}
}

var ErrAuthEmailExists = fmt.Errorf("email already exists")

func (r *Repo) NewTx(ctx context.Context, f func(*Repo) error) error {
	if r.tx != nil {
		return f(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	if err = f(&Repo{nil, tx}); err != nil {
		if errRollback := tx.Rollback(); errRollback != nil {
			return fmt.Errorf("rollback tx: %w", errRollback)
		}
		return fmt.Errorf("repo tx: %w", err)
	}

	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit tx: %w", err)
	}

	return nil
}

func (r *Repo) executor() boil.ContextExecutor {
	if r.tx != nil {
		return r.tx
	}

	return r.db
}

func (r *Repo) CreateAuth(ctx context.Context, email, password string) (*orm.Auth, error) {
	exists, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).Exists(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("email exists check: %w", err)
	}
	if exists {
		return nil, ErrAuthEmailExists
	}

	bcryptPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("bcrypt password generation: %w", err)
	}

	auth := &orm.Auth{
		Email:    email,
		Password: bcryptPassword,
	}

	if err = auth.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return nil, fmt.Errorf("auth insert: %w", err)
	}

	return auth, nil
}

func (r *Repo) CompareEmailAndPassword(ctx context.Context, email, password string) error {
	auth, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, r.executor())
	if err != nil {
		return fmt.Errorf("auth fetch: %w", err)
	}

	if err = bcrypt.CompareHashAndPassword(auth.Password, []byte(password)); err != nil {
		return fmt.Errorf("hash and password comparison: %w", err)
	}

	return nil
}

func (r *Repo) FromEmail(ctx context.Context, email string) (*orm.Auth, error) {
	auth, err := orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("auth fetch: %w", err)
	}
	return auth, nil
}

func (r *Repo) UpdateRefreshToken(ctx context.Context, authID string, refreshToken string) error {
	auth := &orm.Auth{
		ID:           authID,
		RefreshToken: null.StringFrom(refreshToken),
	}
	if _, err := auth.Update(ctx, r.executor(), boil.Whitelist(orm.AuthColumns.RefreshToken)); err != nil {
		return fmt.Errorf("refresh token update: %w", err)
	}
	return nil
}

func (r *Repo) DeleteRefreshToken(ctx context.Context, refreshToken string) error {
	if _, err := orm.Auths(
		orm.AuthWhere.RefreshToken.EQ(null.StringFrom(refreshToken)),
	).UpdateAll(ctx, r.executor(), orm.M{
		orm.AuthColumns.RefreshToken: nil,
	}); err != nil {
		return fmt.Errorf("refresh token delete: %w", err)
	}
	return nil
}

func (r *Repo) RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error) {
	exists, err := orm.Auths(orm.AuthWhere.RefreshToken.EQ(null.StringFrom(refreshToken))).Exists(ctx, r.executor())
	if err != nil {
		return false, fmt.Errorf("refresh token exists check: %w", err)
	}
	return exists, nil
}

type CreateUserParams struct {
	ID        string
	FirstName string
	LastName  string
}

func (r *Repo) CreateUser(ctx context.Context, p CreateUserParams) error {
	user := &orm.User{
		ID:        p.ID,
		FirstName: p.FirstName,
		LastName:  p.LastName,
	}

	if err := user.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return fmt.Errorf("user insert: %w", err)
	}
	return nil
}

type CreateExerciseParams struct {
	UserID string
	Name   string
	Label  string
}

func (r *Repo) CreateExercise(ctx context.Context, p CreateExerciseParams) (*orm.Exercise, error) {
	exercise := &orm.Exercise{
		UserID:   p.UserID,
		Title:    p.Name,
		SubTitle: null.NewString(p.Label, p.Label != ""),
	}
	if err := exercise.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return nil, fmt.Errorf("exercise insert: %w", err)
	}

	return exercise, nil
}

type SoftDeleteExerciseParams struct {
	UserID     string
	ExerciseID string
}

func (r *Repo) SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error {
	if _, err := orm.Exercises(
		orm.ExerciseWhere.ID.EQ(p.ExerciseID),
		orm.ExerciseWhere.UserID.EQ(p.UserID),
	).UpdateAll(ctx, r.executor(), orm.M{
		orm.ExerciseColumns.DeletedAt: null.TimeFrom(time.Now().UTC()),
	}); err != nil {
		return fmt.Errorf("exercise soft delete: %w", err)
	}
	return nil
}

type PageToken struct {
	CreatedAt time.Time `json:"createdAt"`
}

type ListExercisesOpt func() ([]qm.QueryMod, error)

func ListExercisesWithPageToken(pageToken []byte) ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		if pageToken == nil {
			return []qm.QueryMod{
				qm.OrderBy(fmt.Sprintf("%s DESC", orm.ExerciseColumns.CreatedAt)),
			}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []qm.QueryMod{
			orm.ExerciseWhere.CreatedAt.LT(pt.CreatedAt),
			qm.OrderBy(fmt.Sprintf("%s DESC", orm.ExerciseColumns.CreatedAt)),
		}, nil
	}
}

func ListExercisesWithoutDeleted() ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.ExerciseWhere.DeletedAt.IsNull(),
		}, nil
	}
}

func ListExercisesWithIDs(ids []string) ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		if len(ids) == 0 {
			return nil, nil
		}

		return []qm.QueryMod{
			orm.ExerciseWhere.ID.IN(ids),
		}, nil
	}
}

func ListExercisesWithName(name string) ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.ExerciseWhere.Title.ILIKE(fmt.Sprintf("%%%s%%", name)),
		}, nil
	}
}

func ListExercisesWithUserID(userID string) ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.ExerciseWhere.UserID.EQ(userID),
		}, nil
	}
}

func ListExercisesWithLimit(limit int) ListExercisesOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Limit(limit),
		}, nil
	}
}

func (r *Repo) ListExercises(ctx context.Context, opts ...ListExercisesOpt) (orm.ExerciseSlice, error) {
	var queries []qm.QueryMod
	for _, opt := range opts {
		query, err := opt()
		if err != nil {
			return nil, fmt.Errorf("exercise list opt: %w", err)
		}
		queries = append(queries, query...)
	}

	exercises, err := orm.Exercises(queries...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("exercises fetch: %w", err)
	}

	return exercises, nil
}

type GetExerciseOpt func() qm.QueryMod

func GetExerciseWithID(id string) GetExerciseOpt {
	return func() qm.QueryMod {
		return orm.ExerciseWhere.ID.EQ(id)
	}
}

func GetExerciseWithUserID(userID string) GetExerciseOpt {
	return func() qm.QueryMod {
		return orm.ExerciseWhere.UserID.EQ(userID)
	}
}

func (r *Repo) GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*orm.Exercise, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	exercise, err := orm.Exercises(query...).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("exercise fetch: %w", err)
	}
	return exercise, nil
}

func (r *Repo) UpdateExercise(ctx context.Context, exercise *orm.Exercise) error {
	_, err := exercise.Update(ctx, r.executor(), boil.Whitelist(
		orm.ExerciseColumns.Title,
		orm.ExerciseColumns.SubTitle,
	))
	if err != nil {
		return fmt.Errorf("exercise update: %w", err)
	}
	return nil
}

type CreateRoutineParams struct {
	UserID      string
	Name        string
	ExerciseIDs []string
}

var (
	ErrRoutineExerciseBelongsToAnotherUser = fmt.Errorf("exercise does not belong to user")
	ErrRoutineExerciseDeleted              = fmt.Errorf("exercise is deleted")
)

func (r *Repo) CreateRoutine(ctx context.Context, p CreateRoutineParams) (*orm.Routine, error) {
	exercises, err := orm.Exercises(orm.ExerciseWhere.ID.IN(p.ExerciseIDs)).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("exercises fetch: %w", err)
	}

	for _, exercise := range exercises {
		if exercise.UserID != p.UserID {
			return nil, ErrRoutineExerciseBelongsToAnotherUser
		}
		if exercise.DeletedAt.Valid {
			return nil, ErrRoutineExerciseDeleted
		}
	}

	routine := &orm.Routine{
		UserID: p.UserID,
		Title:  p.Name,
	}

	if err = r.NewTx(ctx, func(tx *Repo) error {
		if err = routine.Insert(ctx, tx.executor(), boil.Infer()); err != nil {
			return fmt.Errorf("routine insert: %w", err)
		}

		if err = routine.SetExercises(ctx, tx.executor(), false, exercises...); err != nil {
			return fmt.Errorf("routine exercises set: %w", err)
		}

		if err = tx.UpdateRoutine(ctx, routine.ID, UpdateRoutineExerciseOrder(p.ExerciseIDs)); err != nil {
			return fmt.Errorf("routine update: %w", err)
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("routine tx: %w", err)
	}

	return routine, nil
}

type GetRoutineOpt func() qm.QueryMod

func GetRoutineWithID(id string) GetRoutineOpt {
	return func() qm.QueryMod {
		return orm.RoutineWhere.ID.EQ(id)
	}
}

func GetRoutineWithUserID(userID string) GetRoutineOpt {
	return func() qm.QueryMod {
		return orm.RoutineWhere.UserID.EQ(userID)
	}
}

func GetRoutineWithExercises() GetRoutineOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.RoutineRels.Exercises)
	}
}

func (r *Repo) GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*orm.Routine, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	routine, err := orm.Routines(query...).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("routine fetch: %w", err)
	}

	return routine, nil
}

func (r *Repo) DeleteRoutine(ctx context.Context, id string) error {
	return r.NewTx(ctx, func(tx *Repo) error {
		routine, err := tx.GetRoutine(ctx, GetRoutineWithID(id))
		if err != nil {
			return fmt.Errorf("routine fetch: %w", err)
		}

		if err = routine.SetExercises(ctx, tx.executor(), false); err != nil {
			return fmt.Errorf("routine exercises set: %w", err)
		}

		if _, err = routine.Delete(ctx, tx.executor()); err != nil {
			return fmt.Errorf("routine delete: %w", err)
		}

		return nil
	})
}

type ListRoutineOpt func() ([]qm.QueryMod, error)

func ListRoutinesWithPageToken(pageToken []byte) ListRoutineOpt {
	return func() ([]qm.QueryMod, error) {
		if pageToken == nil {
			return []qm.QueryMod{
				qm.OrderBy(fmt.Sprintf("%s DESC", orm.RoutineColumns.CreatedAt)),
			}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []qm.QueryMod{
			orm.RoutineWhere.CreatedAt.LT(pt.CreatedAt),
			qm.OrderBy(fmt.Sprintf("%s DESC", orm.ExerciseColumns.CreatedAt)),
		}, nil
	}
}

func ListRoutinesWithName(name string) ListRoutineOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.RoutineWhere.Title.ILIKE(fmt.Sprintf("%%%s%%", name)),
		}, nil
	}
}

func ListRoutinesWithUserID(userID string) ListRoutineOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.RoutineWhere.UserID.EQ(userID),
		}, nil
	}
}

func ListRoutinesWithLimit(limit int) ListRoutineOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Limit(limit),
		}, nil
	}
}

func (r *Repo) ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (orm.RoutineSlice, error) {
	var query []qm.QueryMod
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("routine list opt: %w", err)
		}
		query = append(query, q...)
	}

	routines, err := orm.Routines(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("routines fetch: %w", err)
	}

	return routines, nil
}

type UpdateRoutineOpt func() (orm.M, error)

func UpdateRoutineName(name string) UpdateRoutineOpt {
	return func() (orm.M, error) {
		return orm.M{orm.RoutineColumns.Title: name}, nil
	}
}

func UpdateRoutineExerciseOrder(exerciseIDs []string) UpdateRoutineOpt {
	return func() (orm.M, error) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			return nil, fmt.Errorf("exercise IDs marshal: %w", err)
		}

		return orm.M{orm.RoutineColumns.ExerciseOrder: bytes}, nil
	}
}

var errDuplicateColumn = fmt.Errorf("duplicate column")

func (r *Repo) UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error {
	columns := orm.M{}
	for _, opt := range opts {
		column, err := opt()
		if err != nil {
			return fmt.Errorf("routine update opt: %w", err)
		}

		for key, value := range column {
			if columns[key] != nil {
				return fmt.Errorf("%w: %s", errDuplicateColumn, key)
			}
			columns[key] = value
		}
	}

	if _, err := orm.Routines(orm.RoutineWhere.ID.EQ(routineID)).UpdateAll(ctx, r.executor(), columns); err != nil {
		return fmt.Errorf("routine update: %w", err)
	}

	return nil
}

func (r *Repo) AddExerciseToRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error {
	if err := routine.AddExercises(ctx, r.executor(), false, exercise); err != nil {
		return fmt.Errorf("routine exercises add: %w", err)
	}
	return nil
}

func (r *Repo) RemoveExerciseFromRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error {
	if err := routine.RemoveExercises(ctx, r.executor(), exercise); err != nil {
		return fmt.Errorf("routine exercises remove: %w", err)
	}
	return nil
}

type ListWorkoutsOpt func() ([]qm.QueryMod, error)

func (r *Repo) ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (orm.WorkoutSlice, error) {
	var query []qm.QueryMod
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("workout list opt: %w", err)
		}
		query = append(query, q...)
	}

	workouts, err := orm.Workouts(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("workouts fetch: %w", err)
	}

	return workouts, nil
}

func ListWorkoutsWithIDs(ids []string) ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.WorkoutWhere.ID.IN(ids),
		}, nil
	}
}

func ListWorkoutsWithUser() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.User),
		}, nil
	}
}

func ListWorkoutsWithSets() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.Sets),
		}, nil
	}
}

func ListWorkoutsWithUserIDs(userIDs []string) ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			orm.WorkoutWhere.UserID.IN(userIDs),
		}, nil
	}
}

func ListWorkoutsWithLimit(size int) ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Limit(size),
		}, nil
	}
}

func ListWorkoutsWithComments() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.WorkoutComments),
		}, nil
	}
}

func ListWorkoutsWithPageToken(token []byte) ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		if token == nil {
			return []qm.QueryMod{
				qm.OrderBy(fmt.Sprintf("%s DESC", orm.WorkoutColumns.CreatedAt)),
			}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []qm.QueryMod{
			orm.WorkoutWhere.CreatedAt.LT(pt.CreatedAt),
			qm.OrderBy(fmt.Sprintf("%s DESC", orm.WorkoutColumns.CreatedAt)),
		}, nil
	}
}

type CreateWorkoutParams struct {
	Name         string
	UserID       string
	ExerciseSets []ExerciseSet
	StartedAt    time.Time
	FinishedAt   time.Time
}

type ExerciseSet struct {
	ExerciseID string
	Sets       []Set
}

type Set struct {
	Reps   int
	Weight float64
}

func (r *Repo) CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*orm.Workout, error) {
	workout := &orm.Workout{
		Name:       p.Name,
		UserID:     p.UserID,
		StartedAt:  p.StartedAt.Truncate(time.Minute).UTC(),
		FinishedAt: p.FinishedAt.Truncate(time.Minute).UTC(),
	}

	if err := r.NewTx(ctx, func(tx *Repo) error {
		if err := workout.Insert(ctx, tx.executor(), boil.Infer()); err != nil {
			return fmt.Errorf("workout insert: %w", err)
		}

		for _, exerciseSet := range p.ExerciseSets {
			sets := make([]*orm.Set, 0, len(exerciseSet.Sets))
			for _, set := range exerciseSet.Sets {
				sets = append(sets, &orm.Set{
					WorkoutID:  workout.ID,
					ExerciseID: exerciseSet.ExerciseID,
					Reps:       set.Reps,
					Weight:     set.Weight,
				})
			}

			if err := workout.AddSets(ctx, tx.executor(), true, sets...); err != nil {
				return fmt.Errorf("workout sets add: %w", err)
			}
		}

		return nil
	}); err != nil {
		return nil, fmt.Errorf("workout tx: %w", err)
	}

	return workout, nil
}

type GetWorkoutOpt func() qm.QueryMod

func GetWorkoutWithID(id string) GetWorkoutOpt {
	return func() qm.QueryMod {
		return orm.WorkoutWhere.ID.EQ(id)
	}
}

func GetWorkoutWithComments() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutRels.WorkoutComments)
	}
}

func GetWorkoutWithSets() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutRels.Sets)
	}
}

func (r *Repo) GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*orm.Workout, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	workout, err := orm.Workouts(query...).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("workout fetch: %w", err)
	}

	return workout, nil
}

type DeleteWorkoutOpt func() qm.QueryMod

func DeleteWorkoutWithID(id string) DeleteWorkoutOpt {
	return func() qm.QueryMod {
		return orm.WorkoutWhere.ID.EQ(id)
	}
}

func DeleteWorkoutWithUserID(userID string) DeleteWorkoutOpt {
	return func() qm.QueryMod {
		return orm.WorkoutWhere.UserID.EQ(userID)
	}
}

var errDeleteWorkoutMissingOptions = fmt.Errorf("delete workout: missing options")

func (r *Repo) DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error {
	if len(opts) == 0 {
		return errDeleteWorkoutMissingOptions
	}

	query := []qm.QueryMod{
		qm.Load(orm.WorkoutRels.Sets),
		qm.Load(orm.WorkoutRels.WorkoutComments),
	}
	for _, opt := range opts {
		query = append(query, opt())
	}

	return r.NewTx(ctx, func(tx *Repo) error {
		workout, err := orm.Workouts(query...).One(ctx, tx.executor())
		if err != nil {
			return fmt.Errorf("workout fetch: %w", err)
		}

		if _, err = workout.R.Sets.DeleteAll(ctx, tx.executor()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		if _, err = workout.R.WorkoutComments.DeleteAll(ctx, tx.executor()); err != nil {
			return fmt.Errorf("workout comments delete: %w", err)
		}

		if _, err = workout.Delete(ctx, tx.executor()); err != nil {
			return fmt.Errorf("workout delete: %w", err)
		}

		return nil
	})
}

func (r *Repo) GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (orm.SetSlice, error) {
	rawQuery := `
	SELECT * FROM getstronger.sets WHERE workout_id IN (
		SELECT DISTINCT ON (exercise_id) workout_id	
		FROM getstronger.sets 
		WHERE exercise_id = ANY ($1) 
		ORDER BY exercise_id, created_at DESC
	) ORDER BY created_at;
`

	var sets orm.SetSlice
	if err := queries.Raw(rawQuery, types.Array(exerciseIDs)).Bind(ctx, r.executor(), &sets); err != nil {
		return nil, fmt.Errorf("previous workout sets fetch: %w", err)
	}

	return sets, nil
}

type ListPersonalBestsOpt func() qm.QueryMod

func ListPersonalBestsWithUserID(userID string) ListPersonalBestsOpt {
	return func() qm.QueryMod {
		return orm.PersonalBestWhere.UserID.EQ(null.StringFrom(userID))
	}
}

func (r *Repo) ListPersonalBests(ctx context.Context, opts ...ListPersonalBestsOpt) (orm.PersonalBestSlice, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	personalBests, err := orm.PersonalBests(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("personal bests fetch: %w", err)
	}

	return personalBests, nil
}

type FollowParams struct {
	FollowerID string
	FolloweeID string
}

func (r *Repo) Follow(ctx context.Context, p FollowParams) error {
	user := &orm.User{ID: p.FollowerID}
	if err := user.AddFolloweeUsers(ctx, r.executor(), false, &orm.User{ID: p.FolloweeID}); err != nil {
		return fmt.Errorf("follow add: %w", err)
	}

	return nil
}

type UnfollowParams struct {
	FollowerID string
	FolloweeID string
}

func (r *Repo) Unfollow(ctx context.Context, p UnfollowParams) error {
	user := &orm.User{ID: p.FollowerID}
	if err := user.RemoveFolloweeUsers(ctx, r.executor(), &orm.User{ID: p.FolloweeID}); err != nil {
		return fmt.Errorf("follow add: %w", err)
	}

	return nil
}

type ListFollowersOpt func() qm.QueryMod

func (r *Repo) ListFollowers(ctx context.Context, user *orm.User, opts ...ListFollowersOpt) (orm.UserSlice, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	users, err := user.FollowerUsers(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return users, nil
}

type ListFolloweesOpt func() qm.QueryMod

func (r *Repo) ListFollowees(ctx context.Context, user *orm.User, opts ...ListFolloweesOpt) (orm.UserSlice, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	users, err := user.FolloweeUsers(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return users, nil
}

type GetUserOpt func() qm.QueryMod

func GetUserWithID(id string) GetUserOpt {
	return func() qm.QueryMod {
		return orm.UserWhere.ID.EQ(id)
	}
}

func (r *Repo) GetUser(ctx context.Context, opts ...GetUserOpt) (*orm.User, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	user, err := orm.Users(query...).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("user fetch: %w", err)
	}

	return user, nil
}

type ListUsersOpt func() []qm.QueryMod

func ListUsersWithIDs(ids []string) ListUsersOpt {
	return func() []qm.QueryMod {
		return []qm.QueryMod{
			orm.UserWhere.ID.IN(ids),
		}
	}
}

func ListUsersWithNameMatching(query string) ListUsersOpt {
	return func() []qm.QueryMod {
		return []qm.QueryMod{
			orm.UserWhere.FullNameSearch.LIKE(fmt.Sprintf("%%%s%%", strings.ToLower(query))),
			qm.OrderBy(fmt.Sprintf("similarity(full_name_search, '%s') DESC", query)),
		}
	}
}

func ListUsersWithLimit(limit int) ListUsersOpt {
	return func() []qm.QueryMod {
		return []qm.QueryMod{
			qm.Limit(limit),
		}
	}
}

func (r *Repo) ListUsers(ctx context.Context, opts ...ListUsersOpt) (orm.UserSlice, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt()...)
	}

	users, err := orm.Users(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return users, nil
}

type CreateWorkoutCommentParams struct {
	UserID    string
	WorkoutID string
	Comment   string
}

func (r *Repo) CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams) (*orm.WorkoutComment, error) {
	comment := &orm.WorkoutComment{
		UserID:    p.UserID,
		WorkoutID: p.WorkoutID,
		Comment:   p.Comment,
	}

	if err := comment.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return nil, fmt.Errorf("workout comment insert: %w", err)
	}

	return comment, nil
}

type CountUsersOpt func() qm.QueryMod

func CountUsersWithNameMatching(query string) CountUsersOpt {
	return func() qm.QueryMod {
		return orm.UserWhere.FullNameSearch.LIKE(fmt.Sprintf("%%%s%%", strings.ToLower(query)))
	}
}

func (r *Repo) CountUsers(ctx context.Context, opts ...CountUsersOpt) (int64, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	count, err := orm.Users(query...).Count(ctx, r.executor())
	if err != nil {
		return 0, fmt.Errorf("users count: %w", err)
	}

	return count, nil
}

type StoreTraceParams struct {
	Request    string
	StatusCode int
	DurationMS int
}

func (r *Repo) StoreTrace(ctx context.Context, p StoreTraceParams) error {
	trace := &orm.Trace{
		Request:    p.Request,
		StatusCode: p.StatusCode,
		DurationMS: p.DurationMS,
	}
	if err := trace.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return fmt.Errorf("trace insert: %w", err)
	}

	return nil
}

type CreateNotificationParams struct {
	Type    orm.NotificationType
	UserID  string
	Payload NotificationPayload
}

type NotificationPayload struct {
	ActorID   string `json:"actorId,omitempty"`
	WorkoutID string `json:"workoutId,omitempty"`
}

func (r *Repo) CreateNotification(ctx context.Context, p CreateNotificationParams) error {
	payload, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("payload marshal: %w", err)
	}

	n := &orm.Notification{
		UserID:  p.UserID,
		Type:    p.Type,
		Payload: payload,
	}
	if err = n.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return fmt.Errorf("insert: %w", err)
	}

	return nil
}

type GetWorkoutCommentOpt func() qm.QueryMod

func GetWorkoutCommentWithID(id string) GetWorkoutCommentOpt {
	return func() qm.QueryMod {
		return orm.WorkoutCommentWhere.ID.EQ(id)
	}
}

func GetWorkoutCommentWithWorkout() GetWorkoutCommentOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutCommentRels.Workout)
	}
}

func (r *Repo) GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*orm.WorkoutComment, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	comment, err := orm.WorkoutComments(query...).One(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("workout comment fetch: %w", err)
	}

	return comment, nil
}

type ListNotificationsOpt func() qm.QueryMod

func ListNotificationsWithLimit(limit int) ListNotificationsOpt {
	return func() qm.QueryMod {
		return qm.Limit(limit)
	}
}

func ListNotificationsWithUserID(userID string) ListNotificationsOpt {
	return func() qm.QueryMod {
		return orm.NotificationWhere.UserID.EQ(userID)
	}
}

func ListNotificationsWithOnlyUnread(onlyUnread bool) ListNotificationsOpt {
	return func() qm.QueryMod {
		if !onlyUnread {
			return nil
		}

		return orm.NotificationWhere.ReadAt.IsNull()
	}
}

func ListNotificationsOrderByCreatedAtDESC() ListNotificationsOpt {
	return func() qm.QueryMod {
		return qm.OrderBy(fmt.Sprintf("%s DESC", orm.NotificationColumns.CreatedAt))
	}
}

func (r *Repo) ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) (orm.NotificationSlice, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		if opt() == nil {
			continue
		}
		query = append(query, opt())
	}

	notifications, err := orm.Notifications(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("notifications fetch: %w", err)
	}

	return notifications, nil
}

type CountNotificationsOpt func() qm.QueryMod

func CountNotificationsWithUserID(userID string) CountNotificationsOpt {
	return func() qm.QueryMod {
		return orm.NotificationWhere.UserID.EQ(userID)
	}
}

func CountNotificationsWithUnreadOnly(onlyUnread bool) CountNotificationsOpt {
	return func() qm.QueryMod {
		if !onlyUnread {
			return nil
		}

		return orm.NotificationWhere.ReadAt.IsNull()
	}
}

func (r *Repo) CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error) {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		if opt() == nil {
			continue
		}
		query = append(query, opt())
	}

	count, err := orm.Notifications(query...).Count(ctx, r.executor())
	if err != nil {
		return 0, fmt.Errorf("notifications count: %w", err)
	}

	return count, nil
}

type MarkNotificationsAsReadOpt func() qm.QueryMod

func MarkNotificationsAsReadByUserID(userID string) MarkNotificationsAsReadOpt {
	return func() qm.QueryMod {
		return orm.NotificationWhere.UserID.EQ(userID)
	}
}

func (r *Repo) MarkNotificationsAsRead(ctx context.Context, opts ...MarkNotificationsAsReadOpt) error {
	query := make([]qm.QueryMod, 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	if query == nil {
		return nil
	}

	if _, err := orm.Notifications(query...).UpdateAll(ctx, r.executor(), orm.M{
		orm.NotificationColumns.ReadAt: time.Now().UTC(),
	}); err != nil {
		return fmt.Errorf("notifications update: %w", err)
	}

	return nil
}

func (r *Repo) IsUserFollowedByUserID(ctx context.Context, user *orm.User, userID string) (bool, error) {
	exists, err := user.FollowerUsers(orm.UserWhere.ID.EQ(userID)).Exists(ctx, r.executor())
	if err != nil {
		return false, fmt.Errorf("user exists check: %w", err)
	}

	return exists, nil
}
