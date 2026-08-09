package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql"
	"github.com/stephenafamo/bob/dialect/psql/dialect"
	"github.com/stephenafamo/bob/dialect/psql/sm"
	"github.com/stephenafamo/bob/dialect/psql/um"
	bobtypes "github.com/stephenafamo/bob/types"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"github.com/volatiletech/sqlboiler/v4/queries"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
	"github.com/volatiletech/sqlboiler/v4/types"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/safe"
)

type order string

const (
	ASC  order = "ASC"
	DESC order = "DESC"
)

var (
	_ Tx   = (*repo)(nil)
	_ Repo = (*repo)(nil)
)

type repo struct {
	db *sql.DB
	tx *sql.Tx
}

func (r *repo) exec() *sql.Tx {
	return r.tx
}

func New(db *sql.DB) Repo {
	return &repo{db, nil}
}

func (r *repo) NewTx(ctx context.Context, f func(tx Tx) error) error {
	if r.tx != nil {
		return f(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	if err = f(&repo{nil, tx}); err != nil {
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

func (r *repo) executor() boil.ContextExecutor {
	if r.tx != nil {
		return r.tx
	}

	return r.db
}

// bobExec mirrors executor for the tables already migrated to Bob. Both wrap
// the same connection or transaction, so the two ORMs stay consistent while
// the migration is in progress.
func (r *repo) bobExec() bob.Executor {
	if r.tx != nil {
		return bob.NewTx(r.tx)
	}

	return bob.NewDB(r.db)
}

var ErrAuthEmailExists = fmt.Errorf("email already exists")

func (r *repo) CreateAuth(ctx context.Context, email, password string) (*models.Auth, error) {
	exists, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(email),
	).Exists(ctx, r.bobExec())
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

	auth, err := models.Auths.Insert(&models.AuthSetter{
		Email:    omit.From(email),
		Password: omit.From(bcryptPassword),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("auth insert: %w", err)
	}

	return auth, nil
}

type UpdateAuthOpt func() (columns, error)

func UpdateAuthPassword(password string) UpdateAuthOpt {
	return func() (columns, error) {
		passwordHash, err := hashPassword(password)
		if err != nil {
			return nil, fmt.Errorf("password hash: %w", err)
		}

		return columns{models.Auths.Columns.Password.Name(): passwordHash}, nil
	}
}

func UpdateAuthEmailVerified() UpdateAuthOpt {
	return func() (columns, error) {
		return columns{models.Auths.Columns.EmailVerified.Name(): true}, nil
	}
}

func UpdateAuthDeleteRefreshToken() UpdateAuthOpt {
	return func() (columns, error) {
		return columns{models.Auths.Columns.RefreshToken.Name(): nil}, nil
	}
}

func UpdateAuthRefreshToken(refreshToken string) UpdateAuthOpt {
	return func() (columns, error) {
		return columns{models.Auths.Columns.RefreshToken.Name(): refreshToken}, nil
	}
}

const PasswordResetTokenTTL = 24 * time.Hour

func UpdateAuthPasswordResetToken(token string) UpdateAuthOpt {
	return func() (columns, error) {
		return columns{
			models.Auths.Columns.PasswordResetToken.Name():           token,
			models.Auths.Columns.PasswordResetTokenValidUntil.Name(): time.Now().UTC().Add(PasswordResetTokenTTL),
		}, nil
	}
}

func UpdateAuthDeletePasswordResetToken() UpdateAuthOpt {
	return func() (columns, error) {
		return columns{
			models.Auths.Columns.PasswordResetToken.Name():           nil,
			models.Auths.Columns.PasswordResetTokenValidUntil.Name(): nil,
		}, nil
	}
}

func (r *repo) UpdateAuth(ctx context.Context, authID string, opts ...UpdateAuthOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("auth update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		mods := append(cols.updateMods(), um.Where(models.Auths.Columns.ID.EQ(psql.Arg(authID))))
		rows, rowsErr := models.Auths.Update(mods...).Exec(ctx, tx.bobExec())
		if rowsErr != nil {
			return fmt.Errorf("auth update: %w", rowsErr)
		}

		if rows != 1 {
			return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
		}

		return nil
	})
}

func (r *repo) CompareEmailAndPassword(ctx context.Context, email, password string) error {
	auth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(email),
	).One(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("auth fetch: %w", err)
	}

	if err = bcrypt.CompareHashAndPassword(auth.Password, []byte(password)); err != nil {
		return fmt.Errorf("hash and password comparison: %w", err)
	}

	return nil
}

func (r *repo) RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error) {
	exists, err := models.Auths.Query(
		models.SelectWhere.Auths.RefreshToken.EQ(refreshToken),
	).Exists(ctx, r.bobExec())
	if err != nil {
		return false, fmt.Errorf("refresh token exists check: %w", err)
	}
	return exists, nil
}

type CreateUserParams struct {
	AuthID    string
	FirstName string
	LastName  string
}

func (r *repo) CreateUser(ctx context.Context, p CreateUserParams) (*models.User, error) {
	user, err := models.Users.Insert(&models.UserSetter{
		AuthID:    omit.From(p.AuthID),
		FirstName: omit.From(p.FirstName),
		LastName:  omit.From(p.LastName),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("user insert: %w", err)
	}

	return user, nil
}

type CreateExerciseParams struct {
	UserID      string
	Name        string
	Tags        []string
	Metrics     []string
	RestSeconds int
}

func (r *repo) CreateExercise(ctx context.Context, p CreateExerciseParams) (*orm.Exercise, error) {
	// Preserve the original exercise behaviour for internal and older callers that
	// predate configurable measurements. An explicit metric selection may still
	// use a zero rest period.
	if len(p.Metrics) == 0 {
		p.Metrics = []string{"weight", "reps"}
		if p.RestSeconds == 0 {
			p.RestSeconds = 90
		}
	}
	if p.Tags == nil {
		p.Tags = []string{}
	}
	exercise := &orm.Exercise{
		UserID:      p.UserID,
		Title:       p.Name,
		Tags:        types.StringArray(p.Tags),
		Metrics:     types.StringArray(p.Metrics),
		RestSeconds: p.RestSeconds,
	}
	// RestSeconds intentionally supports zero (rest timer disabled), so include it
	// explicitly instead of allowing boil.Infer to replace it with the DB default.
	if err := exercise.Insert(ctx, r.executor(), boil.Whitelist(
		orm.ExerciseColumns.UserID,
		orm.ExerciseColumns.Title,
		orm.ExerciseColumns.Tags,
		orm.ExerciseColumns.Metrics,
		orm.ExerciseColumns.RestSeconds,
	)); err != nil {
		return nil, fmt.Errorf("exercise insert: %w", err)
	}

	return exercise, nil
}

type SoftDeleteExerciseParams struct {
	UserID     string
	ExerciseID string
}

func (r *repo) SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error {
	return r.NewTx(ctx, func(tx Tx) error {
		exercise, err := orm.Exercises(
			orm.ExerciseWhere.ID.EQ(p.ExerciseID),
			orm.ExerciseWhere.UserID.EQ(p.UserID),
			qm.Load(orm.ExerciseRels.Routines),
		).One(ctx, tx.exec())
		if err != nil {
			return fmt.Errorf("exercise fetch: %w", err)
		}

		for _, routine := range exercise.R.Routines {
			var exerciseIDs []string
			if err = json.Unmarshal(routine.ExerciseOrder, &exerciseIDs); err != nil {
				return fmt.Errorf("exercise order unmarshal: %w", err)
			}

			exerciseOrder := make([]string, 0, len(exerciseIDs)-1)
			for _, exerciseID := range exerciseIDs {
				if exerciseID == exercise.ID {
					continue
				}
				exerciseOrder = append(exerciseOrder, exerciseID)
			}

			if err = tx.UpdateRoutine(ctx, routine.ID, UpdateRoutineExerciseOrder(exerciseOrder)); err != nil {
				return fmt.Errorf("routine update: %w", err)
			}
		}

		if err = exercise.SetRoutines(ctx, tx.exec(), false); err != nil {
			return fmt.Errorf("exercise routines set: %w", err)
		}

		exercise.DeletedAt = null.TimeFrom(time.Now().UTC())
		if _, err = exercise.Update(ctx, tx.exec(), boil.Infer()); err != nil {
			return fmt.Errorf("exercise soft delete: %w", err)
		}

		return nil
	})
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

func (r *repo) ListExercises(ctx context.Context, opts ...ListExercisesOpt) (orm.ExerciseSlice, error) {
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

func (r *repo) GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*orm.Exercise, error) {
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

type UpdateExerciseOpt func() (columns, error)

func UpdateExerciseTitle(title string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{orm.ExerciseColumns.Title: title}, nil
	}
}

func UpdateExerciseTags(tags []string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{orm.ExerciseColumns.Tags: types.StringArray(tags)}, nil
	}
}

func UpdateExerciseMetrics(metrics []string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{orm.ExerciseColumns.Metrics: types.StringArray(metrics)}, nil
	}
}

func UpdateExerciseRestSeconds(restSeconds int) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{orm.ExerciseColumns.RestSeconds: restSeconds}, nil
	}
}

func (r *repo) UpdateExercise(ctx context.Context, exerciseID string, opts ...UpdateExerciseOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("exercise update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		rows, rowsErr := orm.Exercises(orm.ExerciseWhere.ID.EQ(exerciseID)).UpdateAll(ctx, tx.exec(), orm.M(cols))
		if rowsErr != nil {
			return fmt.Errorf("exercise update: %w", err)
		}

		if rows > 1 {
			return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
		}

		return nil
	})
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

func (r *repo) CreateRoutine(ctx context.Context, p CreateRoutineParams) (*orm.Routine, error) {
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

	if err = r.NewTx(ctx, func(tx Tx) error {
		if err = routine.Insert(ctx, tx.exec(), boil.Infer()); err != nil {
			return fmt.Errorf("routine insert: %w", err)
		}

		if err = routine.SetExercises(ctx, tx.exec(), false, exercises...); err != nil {
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

func (r *repo) GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*orm.Routine, error) {
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

func (r *repo) DeleteRoutine(ctx context.Context, id string) error {
	return r.NewTx(ctx, func(tx Tx) error {
		routine, err := tx.GetRoutine(ctx, GetRoutineWithID(id))
		if err != nil {
			return fmt.Errorf("routine fetch: %w", err)
		}

		if err = routine.SetExercises(ctx, tx.exec(), false); err != nil {
			return fmt.Errorf("routine exercises set: %w", err)
		}

		if _, err = routine.Delete(ctx, tx.exec()); err != nil {
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

func ListRoutinesLoadExercises() ListRoutineOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.RoutineRels.Exercises),
		}, nil
	}
}

func (r *repo) ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (orm.RoutineSlice, error) {
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

type UpdateRoutineOpt func() (columns, error)

func UpdateRoutineName(name string) UpdateRoutineOpt {
	return func() (columns, error) {
		return columns{orm.RoutineColumns.Title: name}, nil
	}
}

func UpdateRoutineExerciseOrder(exerciseIDs []string) UpdateRoutineOpt {
	return func() (columns, error) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			return nil, fmt.Errorf("exercise IDs marshal: %w", err)
		}

		return columns{orm.RoutineColumns.ExerciseOrder: bytes}, nil
	}
}

func (r *repo) UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("routine update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		rows, rowsErr := orm.Routines(orm.RoutineWhere.ID.EQ(routineID)).UpdateAll(ctx, tx.exec(), orm.M(cols))
		if rowsErr != nil {
			return fmt.Errorf("routine update: %w", err)
		}

		if rows > 1 {
			return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
		}

		return nil
	})
}

func (r *repo) AddExerciseToRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error {
	if err := routine.AddExercises(ctx, r.executor(), false, exercise); err != nil {
		return fmt.Errorf("routine exercises add: %w", err)
	}
	return nil
}

func (r *repo) RemoveExerciseFromRoutine(ctx context.Context, exercise *orm.Exercise, routine *orm.Routine) error {
	if err := routine.RemoveExercises(ctx, r.executor(), exercise); err != nil {
		return fmt.Errorf("routine exercises remove: %w", err)
	}
	return nil
}

type ListWorkoutsOpt func() ([]qm.QueryMod, error)

func (r *repo) ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (orm.WorkoutSlice, error) {
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

func ListWorkoutsLoadUser() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.User),
		}, nil
	}
}

func ListWorkoutsLoadComments() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.WorkoutComments),
		}, nil
	}
}

func ListWorkoutsLoadSets() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(orm.WorkoutRels.Sets),
		}, nil
	}
}

func ListWorkoutsWithUserIDs(userIDs ...string) ListWorkoutsOpt {
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
	Note         string
	UserID       string
	RoutineID    string
	ExerciseSets []ExerciseSet
	StartedAt    time.Time
	FinishedAt   time.Time
}

type ExerciseSet struct {
	ExerciseID string
	Sets       []Set
}

type Set struct {
	ID              string
	Reps            int
	Weight          float64
	Distance        float64
	DurationSeconds int
}

func (r *repo) CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*orm.Workout, error) {
	workout := &orm.Workout{
		Name:       p.Name,
		Note:       null.NewString(p.Note, p.Note != ""),
		UserID:     p.UserID,
		RoutineID:  null.NewString(p.RoutineID, p.RoutineID != ""),
		StartedAt:  p.StartedAt.Truncate(time.Minute).UTC(),
		FinishedAt: p.FinishedAt.Truncate(time.Minute).UTC(),
	}

	if err := r.NewTx(ctx, func(tx Tx) error {
		if err := workout.Insert(ctx, tx.exec(), boil.Infer()); err != nil {
			return fmt.Errorf("workout insert: %w", err)
		}

		for _, exerciseSet := range p.ExerciseSets {
			sets := make([]*orm.Set, 0, len(exerciseSet.Sets))
			for _, set := range exerciseSet.Sets {
				sets = append(sets, &orm.Set{
					Reps:            set.Reps,
					Weight:          set.Weight,
					Distance:        set.Distance,
					DurationSeconds: set.DurationSeconds,
					UserID:          p.UserID,
					WorkoutID:       workout.ID,
					ExerciseID:      exerciseSet.ExerciseID,
				})
			}

			if err := workout.AddSets(ctx, tx.exec(), true, sets...); err != nil {
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

func GetWorkoutLoadSets() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutRels.Sets)
	}
}

func GetWorkoutLoadUser() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutRels.User)
	}
}

func GetWorkoutLoadComments() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(orm.WorkoutRels.WorkoutComments)
	}
}

func GetWorkoutLoadExercises() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(fmt.Sprintf("%s.%s", orm.WorkoutRels.Sets, orm.SetRels.Exercise))
	}
}

func GetWorkoutLoadCommentUsers() GetWorkoutOpt {
	return func() qm.QueryMod {
		return qm.Load(fmt.Sprintf("%s.%s", orm.WorkoutRels.WorkoutComments, orm.WorkoutCommentRels.User))
	}
}

func (r *repo) GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*orm.Workout, error) {
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

func (r *repo) DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error {
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

	return r.NewTx(ctx, func(tx Tx) error {
		workout, err := orm.Workouts(query...).One(ctx, tx.exec())
		if err != nil {
			return fmt.Errorf("workout fetch: %w", err)
		}

		if _, err = workout.R.Sets.DeleteAll(ctx, tx.exec()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		if _, err = workout.R.WorkoutComments.DeleteAll(ctx, tx.exec()); err != nil {
			return fmt.Errorf("workout comments delete: %w", err)
		}

		if _, err = orm.Notifications(
			qm.Where("payload ->> 'workoutId' = ?", workout.ID),
		).DeleteAll(ctx, tx.exec()); err != nil {
			return fmt.Errorf("notifications delete: %w", err)
		}

		if _, err = workout.Delete(ctx, tx.exec()); err != nil {
			return fmt.Errorf("workout delete: %w", err)
		}

		return nil
	})
}

func (r *repo) GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (orm.SetSlice, error) {
	rawQuery := `
SELECT id FROM getstronger.sets 
WHERE (exercise_id, workout_id) IN (
	SELECT DISTINCT ON (exercise_id) exercise_id, workout_id	
	FROM getstronger.sets
	WHERE exercise_id = ANY($1)
	ORDER BY exercise_id, created_at DESC
)
ORDER BY created_at;
`

	var sets orm.SetSlice
	if err := queries.Raw(rawQuery, types.Array(exerciseIDs)).Bind(ctx, r.executor(), &sets); err != nil {
		return nil, fmt.Errorf("previous workout sets fetch: %w", err)
	}

	setIDs := make([]string, 0, len(sets))
	for _, set := range sets {
		setIDs = append(setIDs, set.ID)
	}

	return r.ListSets(
		ctx,
		ListSetsWithID(setIDs...),
		ListSetsLoadExercise(),
		ListSetsOrderByCreatedAt(ASC),
	)
}

func (r *repo) GetPersonalBests(ctx context.Context, userIDs ...string) (orm.SetSlice, error) {
	workouts, err := r.ListWorkouts(ctx, ListWorkoutsWithUserIDs(userIDs...))
	if err != nil {
		return nil, fmt.Errorf("workouts fetch: %w", err)
	}

	workoutIDs := make([]string, 0, len(workouts))
	for _, workout := range workouts {
		workoutIDs = append(workoutIDs, workout.ID)
	}

	rawQuery := `
	SELECT DISTINCT ON (sets.exercise_id) sets.exercise_id, sets.id
	FROM getstronger.sets
	JOIN getstronger.exercises ON exercises.id = sets.exercise_id
	WHERE sets.workout_id = ANY ($1)
	ORDER BY
		sets.exercise_id,
		CASE WHEN 'weight' = ANY(exercises.metrics) THEN sets.weight ELSE 0 END DESC,
		CASE WHEN 'reps' = ANY(exercises.metrics) THEN sets.reps ELSE 0 END DESC,
		CASE WHEN 'distance' = ANY(exercises.metrics) THEN sets.distance ELSE 0 END DESC,
		CASE WHEN 'time' = ANY(exercises.metrics) THEN sets.duration_seconds ELSE 0 END DESC,
		sets.created_at ASC;
`

	var sets orm.SetSlice
	if err = queries.Raw(rawQuery, types.Array(workoutIDs)).Bind(ctx, r.executor(), &sets); err != nil {
		return nil, fmt.Errorf("sets fetch: %w", err)
	}

	setIDs := make([]string, 0, len(sets))
	for _, set := range sets {
		setIDs = append(setIDs, set.ID)
	}

	return r.ListSets(
		ctx,
		ListSetsWithID(setIDs...),
		ListSetsLoadExercise(),
		ListSetsOrderByCreatedAt(DESC),
	)
}

type FollowParams struct {
	FollowerID string
	FolloweeID string
}

func (r *repo) Follow(ctx context.Context, p FollowParams) error {
	if _, err := models.Followers.Insert(&models.FollowerSetter{
		FollowerID: omit.From(p.FollowerID),
		FolloweeID: omit.From(p.FolloweeID),
	}).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("follow add: %w", err)
	}

	return nil
}

type UnfollowParams struct {
	FollowerID string
	FolloweeID string
}

func (r *repo) Unfollow(ctx context.Context, p UnfollowParams) error {
	if _, err := models.Followers.Delete(
		models.DeleteWhere.Followers.FollowerID.EQ(p.FollowerID),
		models.DeleteWhere.Followers.FolloweeID.EQ(p.FolloweeID),
	).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("follow remove: %w", err)
	}

	return nil
}

// followerIDsOf selects the users following userID, and followeeIDsOf the users
// they follow. Bob collapses both foreign keys of the self-referencing
// followers table into one relationship, so each direction is spelled out.
func followerIDsOf(userID string) bob.Expression {
	return psql.Select(
		sm.Columns(models.Followers.Columns.FollowerID),
		sm.From(models.Followers.NameExpr()),
		sm.Where(models.Followers.Columns.FolloweeID.EQ(psql.Arg(userID))),
	)
}

func followeeIDsOf(userID string) bob.Expression {
	return psql.Select(
		sm.Columns(models.Followers.Columns.FolloweeID),
		sm.From(models.Followers.NameExpr()),
		sm.Where(models.Followers.Columns.FollowerID.EQ(psql.Arg(userID))),
	)
}

type ListFollowersOpt func() bob.Mod[*dialect.SelectQuery]

func (r *repo) ListFollowers(ctx context.Context, userID string, opts ...ListFollowersOpt) (models.UserSlice, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts)+1)
	query = append(query, sm.Where(models.Users.Columns.ID.In(followerIDsOf(userID))))
	for _, opt := range opts {
		query = append(query, opt())
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return users, nil
}

type ListFolloweesOpt func() bob.Mod[*dialect.SelectQuery]

func (r *repo) ListFollowees(ctx context.Context, userID string, opts ...ListFolloweesOpt) (models.UserSlice, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts)+1)
	query = append(query, sm.Where(models.Users.Columns.ID.In(followeeIDsOf(userID))))
	for _, opt := range opts {
		query = append(query, opt())
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return users, nil
}

type GetUserOpt func() bob.Mod[*dialect.SelectQuery]

func GetUserWithID(id string) GetUserOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Users.ID.EQ(id)
	}
}

func GetUserLoadAuth() GetUserOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.User.Auth()
	}
}

func (r *repo) GetUser(ctx context.Context, opts ...GetUserOpt) (*models.User, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	user, err := models.Users.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("user fetch: %w", err)
	}

	return user, nil
}

type ListUsersOpt func() []bob.Mod[*dialect.SelectQuery]

func ListUsersWithIDs(ids []string) ListUsersOpt {
	return func() []bob.Mod[*dialect.SelectQuery] {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Users.ID.In(ids...),
		}
	}
}

func ListUsersWithNameMatching(query string) ListUsersOpt {
	return func() []bob.Mod[*dialect.SelectQuery] {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Users.FullNameSearch.Like(fmt.Sprintf("%%%s%%", strings.ToLower(query))),
			sm.OrderBy(psql.F("similarity", models.Users.Columns.FullNameSearch, psql.Arg(query))).Desc(),
		}
	}
}

func ListUsersWithLimit(limit int) ListUsersOpt {
	return func() []bob.Mod[*dialect.SelectQuery] {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}
	}
}

func (r *repo) ListUsers(ctx context.Context, opts ...ListUsersOpt) (models.UserSlice, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt()...)
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
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

type CreateWorkoutCommentOpts func(comment *orm.WorkoutComment) error

func (r *repo) PostCreateWorkoutCommentLoadUser(ctx context.Context) CreateWorkoutCommentOpts {
	return func(comment *orm.WorkoutComment) error {
		user, err := comment.User().One(ctx, r.executor())
		if err != nil {
			return fmt.Errorf("user fetch: %w", err)
		}

		if err = comment.SetUser(ctx, r.executor(), false, user); err != nil {
			return fmt.Errorf("comment user set: %w", err)
		}

		return nil
	}
}

func (r *repo) CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams, opts ...CreateWorkoutCommentOpts) (*orm.WorkoutComment, error) {
	comment := &orm.WorkoutComment{
		UserID:    p.UserID,
		WorkoutID: p.WorkoutID,
		Comment:   p.Comment,
	}

	if err := comment.Insert(ctx, r.executor(), boil.Infer()); err != nil {
		return nil, fmt.Errorf("workout comment insert: %w", err)
	}

	for _, opt := range opts {
		if err := opt(comment); err != nil {
			return nil, fmt.Errorf("workout comment opt: %w", err)
		}
	}

	return comment, nil
}

type StoreTraceParams struct {
	Request    string
	StatusCode int
	DurationMS int
}

func (r *repo) StoreTrace(ctx context.Context, p StoreTraceParams) error {
	if _, err := models.Traces.Insert(&models.TraceSetter{
		Request:    omit.From(p.Request),
		StatusCode: omit.From(safe.Int32FromInt(p.StatusCode)),
		DurationMS: omit.From(safe.Int32FromInt(p.DurationMS)),
	}).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("trace insert: %w", err)
	}

	return nil
}

type CreateNotificationParams struct {
	Type    NotificationType
	UserID  string
	Payload NotificationPayload
}

type NotificationPayload struct {
	ActorID   string `json:"actorId,omitempty"`
	WorkoutID string `json:"workoutId,omitempty"`
}

func (r *repo) CreateNotification(ctx context.Context, p CreateNotificationParams) error {
	payload, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("payload marshal: %w", err)
	}

	if _, err = models.Notifications.Insert(&models.NotificationSetter{
		UserID:  omit.From(p.UserID),
		Type:    omit.From(p.Type),
		Payload: omit.From(bobtypes.NewJSON[json.RawMessage](payload)),
	}).Exec(ctx, r.bobExec()); err != nil {
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

func (r *repo) GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*orm.WorkoutComment, error) {
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

type ListNotificationsOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListNotificationsWithLimit(limit int) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}, nil
	}
}

func ListNotificationsWithUserID(userID string) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Notifications.UserID.EQ(userID),
		}, nil
	}
}

func ListNotificationsWithPageToken(token []byte) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		newestFirst := sm.OrderBy(models.Notifications.Columns.CreatedAt).Desc()
		if len(token) == 0 {
			return []bob.Mod[*dialect.SelectQuery]{newestFirst}, nil
		}

		var pageToken PageToken
		if err := json.Unmarshal(token, &pageToken); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Notifications.CreatedAt.LT(pageToken.CreatedAt),
			newestFirst,
		}, nil
	}
}

func (r *repo) ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) (models.NotificationSlice, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("notifications list opt: %w", err)
		}

		query = append(query, q...)
	}

	notifications, err := models.Notifications.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("notifications fetch: %w", err)
	}

	return notifications, nil
}

type CountNotificationsOpt func() bob.Mod[*dialect.SelectQuery]

func CountNotificationsWithUserID(userID string) CountNotificationsOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Notifications.UserID.EQ(userID)
	}
}

func CountNotificationsWithUnreadOnly(onlyUnread bool) CountNotificationsOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		if !onlyUnread {
			return nil
		}

		return models.SelectWhere.Notifications.ReadAt.IsNull()
	}
}

func (r *repo) CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		if opt() == nil {
			continue
		}
		query = append(query, opt())
	}

	count, err := models.Notifications.Query(query...).Count(ctx, r.bobExec())
	if err != nil {
		return 0, fmt.Errorf("notifications count: %w", err)
	}

	return count, nil
}

func (r *repo) MarkNotificationsAsRead(ctx context.Context, userID string) error {
	if _, err := models.Notifications.Update(
		um.SetCol(models.Notifications.Columns.ReadAt.Name()).ToArg(time.Now().UTC()),
		models.UpdateWhere.Notifications.UserID.EQ(userID),
	).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("notifications update: %w", err)
	}

	return nil
}

func (r *repo) IsUserFollowedByUserID(ctx context.Context, user *models.User, userID string) (bool, error) {
	exists, err := models.Followers.Query(
		models.SelectWhere.Followers.FolloweeID.EQ(user.ID),
		models.SelectWhere.Followers.FollowerID.EQ(userID),
	).Exists(ctx, r.bobExec())
	if err != nil {
		return false, fmt.Errorf("user exists check: %w", err)
	}

	return exists, nil
}

type GetAuthOpt func() bob.Mod[*dialect.SelectQuery]

func GetAuthByID(id string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.ID.EQ(id)
	}
}

func GetAuthByEmail(email string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.Email.EQ(email)
	}
}

func GetAuthByEmailToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.EmailToken.EQ(token)
	}
}

func GetAuthWithUser() GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.Auth.User()
	}
}

func GetAuthByPasswordResetToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.PasswordResetToken.EQ(token)
	}
}

func GetAuthByRefreshToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.RefreshToken.EQ(token)
	}
}

func (r *repo) GetAuth(ctx context.Context, opts ...GetAuthOpt) (*models.Auth, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	auth, err := models.Auths.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("auth fetch: %w", err)
	}

	return auth, nil
}

type ListSetsOpt func() (qm.QueryMod, error)

func ListSetsWithLimit(limit int) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return qm.Limit(limit), nil
	}
}

func ListSetsWithUserID(userID ...string) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return orm.SetWhere.UserID.IN(userID), nil
	}
}

func ListSetsWithExerciseID(exerciseID ...string) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return orm.SetWhere.ExerciseID.IN(exerciseID), nil
	}
}

func ListSetsWithPageToken(token []byte) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		if token == nil {
			return nil, nil
		}

		var pt PageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return orm.SetWhere.CreatedAt.LT(pt.CreatedAt), nil
	}
}

func ListSetsWithID(id ...string) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return orm.SetWhere.ID.IN(id), nil
	}
}

func ListSetsLoadExercise() ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return qm.Load(orm.SetRels.Exercise), nil
	}
}

func ListSetsOrderByCreatedAt(order order) ListSetsOpt {
	return func() (qm.QueryMod, error) {
		return qm.OrderBy(fmt.Sprintf("%s %s", orm.SetColumns.CreatedAt, order)), nil
	}
}

func (r *repo) ListSets(ctx context.Context, opts ...ListSetsOpt) (orm.SetSlice, error) {
	var query []qm.QueryMod
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("sets list opt: %w", err)
		}
		if q != nil {
			query = append(query, q)
		}
	}

	sets, err := orm.Sets(query...).All(ctx, r.executor())
	if err != nil {
		return nil, fmt.Errorf("sets fetch: %w", err)
	}

	return sets, nil
}

func (r *repo) SetRoutineExercises(ctx context.Context, routine *orm.Routine, exercises orm.ExerciseSlice) error {
	if err := routine.SetExercises(ctx, r.executor(), false, exercises...); err != nil {
		return fmt.Errorf("routine exercises set: %w", err)
	}

	return nil
}

type UpdateWorkoutOpt func() (columns, error)

func UpdateWorkoutName(name string) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			orm.WorkoutColumns.Name: name,
		}, nil
	}
}

func UpdateWorkoutNote(note string) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			orm.WorkoutColumns.Note: null.NewString(note, note != ""),
		}, nil
	}
}

func UpdateWorkoutStartedAt(startedAt time.Time) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			orm.WorkoutColumns.StartedAt: startedAt,
		}, nil
	}
}

func UpdateWorkoutFinishedAt(finishedAt time.Time) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			orm.WorkoutColumns.FinishedAt: finishedAt,
		}, nil
	}
}

func (r *repo) UpdateWorkout(ctx context.Context, workoutID string, opts ...UpdateWorkoutOpt) error {
	if _, err := r.GetWorkout(ctx, GetWorkoutWithID(workoutID)); err != nil {
		return fmt.Errorf("workout fetch: %w", err)
	}

	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("workout update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		rows, rowsErr := orm.Workouts(orm.WorkoutWhere.ID.EQ(workoutID)).UpdateAll(ctx, tx.exec(), orm.M(cols))
		if rowsErr != nil {
			return fmt.Errorf("workout update: %w", err)
		}

		if rows > 1 {
			return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
		}

		return nil
	})
}

type UpdateWorkoutSetsParams struct {
	WorkoutID    string
	ExerciseSets []ExerciseSet
}

func (r *repo) UpdateWorkoutSets(ctx context.Context, p UpdateWorkoutSetsParams) error {
	return r.NewTx(ctx, func(tx Tx) error {
		workout, err := r.GetWorkout(
			ctx,
			GetWorkoutWithID(p.WorkoutID),
			GetWorkoutLoadSets(),
		)
		if err != nil {
			return fmt.Errorf("workout fetch: %w", err)
		}

		if _, err = workout.R.Sets.DeleteAll(ctx, tx.exec()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		var sets orm.SetSlice
		setCreatedAt := workout.CreatedAt
		for _, exerciseSet := range p.ExerciseSets {
			for _, set := range exerciseSet.Sets {
				sets = append(sets, &orm.Set{
					UserID:          workout.UserID,
					WorkoutID:       workout.ID,
					ExerciseID:      exerciseSet.ExerciseID,
					Reps:            set.Reps,
					Weight:          set.Weight,
					Distance:        set.Distance,
					DurationSeconds: set.DurationSeconds,
					CreatedAt:       setCreatedAt,
				})
			}

			// Simulate a rest period between sets.
			const durationSetRest = 2 * time.Minute
			setCreatedAt = setCreatedAt.Add(durationSetRest)
		}

		if err = workout.AddSets(ctx, tx.exec(), true, sets...); err != nil {
			return fmt.Errorf("workout sets add: %w", err)
		}

		return nil
	})
}

var (
	ErrEmptyPayload = fmt.Errorf("empty payload")
	ErrInvalidTopic = fmt.Errorf("invalid topic")
)

func (r *repo) PublishEvent(ctx context.Context, topic EventTopic, payload []byte) error {
	if !topic.Valid() {
		return fmt.Errorf("%w: %s", ErrInvalidTopic, topic)
	}

	if len(payload) == 0 {
		return ErrEmptyPayload
	}

	return r.NewTx(ctx, func(tx Tx) error {
		if _, err := models.Events.Insert(&models.EventSetter{
			Topic:   omit.From(topic),
			Payload: omit.From(bobtypes.NewJSON[json.RawMessage](payload)),
		}).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("event insert: %w", err)
		}

		if _, err := tx.exec().ExecContext(ctx, "SELECT pg_notify($1, $2)", topic.String(), payload); err != nil {
			return fmt.Errorf("pg_notify: %w", err)
		}

		return nil
	})
}

func ListWorkoutsLoadExercises() ListWorkoutsOpt {
	return func() ([]qm.QueryMod, error) {
		return []qm.QueryMod{
			qm.Load(fmt.Sprintf("%s.%s", orm.WorkoutRels.Sets, orm.SetRels.Exercise)),
		}, nil
	}
}
