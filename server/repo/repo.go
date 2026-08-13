package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/gofrs/uuid/v5"
	"github.com/lib/pq"
	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql"
	"github.com/stephenafamo/bob/dialect/psql/dialect"
	"github.com/stephenafamo/bob/dialect/psql/dm"
	"github.com/stephenafamo/bob/dialect/psql/im"
	"github.com/stephenafamo/bob/dialect/psql/sm"
	"github.com/stephenafamo/bob/dialect/psql/um"
	bobtypes "github.com/stephenafamo/bob/types"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/models"
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

// sqlExecutor is the subset of database/sql both *sql.DB and *sql.Tx provide.
type sqlExecutor interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// sqlExec exposes the raw connection for the hand-written queries that have no
// ORM equivalent, chiefly the training plan tables.
func (r *repo) sqlExec() sqlExecutor {
	if r.tx != nil {
		return r.tx
	}

	return r.db
}

// scanIDs collects the single id column a raw query projects.
func scanIDs(rows *sql.Rows) ([]string, error) {
	defer func() { _ = rows.Close() }()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan id: %w", err)
		}
		ids = append(ids, id)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("rows: %w", err)
	}

	return ids, nil
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

// nullIfEmpty stores an empty string as SQL NULL, matching the behaviour the
// columns had under SQLBoiler's null.NewString(v, v != "").
func nullIfEmpty(v string) omitnull.Val[string] {
	if v == "" {
		var val omitnull.Val[string]
		val.Null()
		return val
	}

	return omitnull.From(v)
}

func (r *repo) SetRoutineExercises(ctx context.Context, routine *models.Routine, exercises models.ExerciseSlice) error {
	if err := setRoutineExercises(ctx, r.bobExec(), routine.ID, exercises); err != nil {
		return fmt.Errorf("routine exercises set: %w", err)
	}

	return nil
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
		AuthID:    omit.From(uuidFromString(p.AuthID)),
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

func (r *repo) CreateExercise(ctx context.Context, p CreateExerciseParams) (*models.Exercise, error) {
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
	// RestSeconds intentionally supports zero (rest timer disabled). Setting it
	// explicitly keeps the DB default from taking over.
	exercise, err := models.Exercises.Insert(&models.ExerciseSetter{
		UserID:      omit.From(uuidFromString(p.UserID)),
		Title:       omit.From(p.Name),
		Tags:        omit.From(pq.StringArray(p.Tags)),
		Metrics:     omit.From(pq.StringArray(p.Metrics)),
		RestSeconds: omit.From(safe.Int32FromInt(p.RestSeconds)),
	}).One(ctx, r.bobExec())
	if err != nil {
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
		exercise, err := models.Exercises.Query(
			models.SelectWhere.Exercises.ID.EQ(uuidFromString(p.ExerciseID)),
			models.SelectWhere.Exercises.UserID.EQ(uuidFromString(p.UserID)),
			models.SelectThenLoad.Exercise.Routines(),
		).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("exercise fetch: %w", err)
		}

		for _, routine := range exercise.R.Routines {
			var exerciseIDs []string
			if err = json.Unmarshal(routine.ExerciseOrder.Val, &exerciseIDs); err != nil {
				return fmt.Errorf("exercise order unmarshal: %w", err)
			}

			exerciseOrder := make([]string, 0, len(exerciseIDs)-1)
			for _, exerciseID := range exerciseIDs {
				if exerciseID == exercise.ID.String() {
					continue
				}
				exerciseOrder = append(exerciseOrder, exerciseID)
			}

			if err = tx.UpdateRoutine(ctx, routine.ID.String(), UpdateRoutineExerciseOrder(exerciseOrder)); err != nil {
				return fmt.Errorf("routine update: %w", err)
			}
		}

		if _, err = models.ExercisesRoutines.Delete(
			models.DeleteWhere.ExercisesRoutines.ExerciseID.EQ(exercise.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("exercise routines set: %w", err)
		}

		if err = exercise.Update(ctx, tx.bobExec(), &models.ExerciseSetter{
			DeletedAt: omitnull.From(time.Now().UTC()),
		}); err != nil {
			return fmt.Errorf("exercise soft delete: %w", err)
		}

		return nil
	})
}

type ListExercisesOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListExercisesWithPageToken(pageToken []byte) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		newestFirst := sm.OrderBy(models.Exercises.Columns.CreatedAt).Desc()
		if pageToken == nil {
			return []bob.Mod[*dialect.SelectQuery]{newestFirst}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.CreatedAt.LT(pt.CreatedAt),
			newestFirst,
		}, nil
	}
}

func ListExercisesWithoutDeleted() ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.DeletedAt.IsNull(),
		}, nil
	}
}

func ListExercisesWithIDs(ids []string) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		if len(ids) == 0 {
			return nil, nil
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.ID.In(uuidsFromStrings(ids)...),
		}, nil
	}
}

func ListExercisesWithName(name string) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.Title.ILike(fmt.Sprintf("%%%s%%", name)),
		}, nil
	}
}

func ListExercisesWithUserID(userID string) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.UserID.EQ(uuidFromString(userID)),
		}, nil
	}
}

func ListExercisesWithLimit(limit int) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}, nil
	}
}

func (r *repo) ListExercises(ctx context.Context, opts ...ListExercisesOpt) (models.ExerciseSlice, error) {
	var queries []bob.Mod[*dialect.SelectQuery]
	for _, opt := range opts {
		query, err := opt()
		if err != nil {
			return nil, fmt.Errorf("exercise list opt: %w", err)
		}
		queries = append(queries, query...)
	}

	exercises, err := models.Exercises.Query(queries...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercises fetch: %w", err)
	}

	return exercises, nil
}

type GetExerciseOpt func() bob.Mod[*dialect.SelectQuery]

func GetExerciseWithID(id string) GetExerciseOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Exercises.ID.EQ(uuidFromString(id))
	}
}

func GetExerciseWithUserID(userID string) GetExerciseOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Exercises.UserID.EQ(uuidFromString(userID))
	}
}

func (r *repo) GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*models.Exercise, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	exercise, err := models.Exercises.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercise fetch: %w", err)
	}
	return exercise, nil
}

type UpdateExerciseOpt func() (columns, error)

func UpdateExerciseTitle(title string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{models.Exercises.Columns.Title.Name(): title}, nil
	}
}

func UpdateExerciseTags(tags []string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{models.Exercises.Columns.Tags.Name(): pq.StringArray(tags)}, nil
	}
}

func UpdateExerciseMetrics(metrics []string) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{models.Exercises.Columns.Metrics.Name(): pq.StringArray(metrics)}, nil
	}
}

func UpdateExerciseRestSeconds(restSeconds int) UpdateExerciseOpt {
	return func() (columns, error) {
		return columns{models.Exercises.Columns.RestSeconds.Name(): safe.Int32FromInt(restSeconds)}, nil
	}
}

func (r *repo) UpdateExercise(ctx context.Context, exerciseID string, opts ...UpdateExerciseOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("exercise update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		mods := append(cols.updateMods(), models.UpdateWhere.Exercises.ID.EQ(uuidFromString(exerciseID)))
		rows, rowsErr := models.Exercises.Update(mods...).Exec(ctx, tx.bobExec())
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

func (r *repo) CreateRoutine(ctx context.Context, p CreateRoutineParams) (*models.Routine, error) {
	exercises, err := models.Exercises.Query(
		models.SelectWhere.Exercises.ID.In(uuidsFromStrings(p.ExerciseIDs)...),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercises fetch: %w", err)
	}

	for _, exercise := range exercises {
		if exercise.UserID != uuidFromString(p.UserID) {
			return nil, ErrRoutineExerciseBelongsToAnotherUser
		}
		if !exercise.DeletedAt.IsNull() {
			return nil, ErrRoutineExerciseDeleted
		}
	}

	var routine *models.Routine
	if err = r.NewTx(ctx, func(tx Tx) error {
		routine, err = models.Routines.Insert(&models.RoutineSetter{
			UserID: omit.From(uuidFromString(p.UserID)),
			Title:  omit.From(p.Name),
		}).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("routine insert: %w", err)
		}

		if err = setRoutineExercises(ctx, tx.bobExec(), routine.ID, exercises); err != nil {
			return fmt.Errorf("routine exercises set: %w", err)
		}

		if err = tx.UpdateRoutine(ctx, routine.ID.String(), UpdateRoutineExerciseOrder(p.ExerciseIDs)); err != nil {
			return fmt.Errorf("routine update: %w", err)
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("routine tx: %w", err)
	}

	return routine, nil
}

// setRoutineExercises replaces a routine's exercise links, the equivalent of
// SQLBoiler's SetExercises.
func setRoutineExercises(ctx context.Context, exec bob.Executor, routineID uuid.UUID, exercises models.ExerciseSlice) error {
	if _, err := models.ExercisesRoutines.Delete(
		models.DeleteWhere.ExercisesRoutines.RoutineID.EQ(routineID),
	).Exec(ctx, exec); err != nil {
		return fmt.Errorf("routine exercises delete: %w", err)
	}

	if len(exercises) == 0 {
		return nil
	}

	links := make([]*models.ExercisesRoutineSetter, 0, len(exercises))
	for _, exercise := range exercises {
		links = append(links, &models.ExercisesRoutineSetter{
			RoutineID:  omit.From(routineID),
			ExerciseID: omit.From(exercise.ID),
		})
	}

	if _, err := models.ExercisesRoutines.Insert(bob.ToMods(links...)).Exec(ctx, exec); err != nil {
		return fmt.Errorf("routine exercises insert: %w", err)
	}

	return nil
}

type GetRoutineOpt func() bob.Mod[*dialect.SelectQuery]

func GetRoutineWithID(id string) GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Routines.ID.EQ(uuidFromString(id))
	}
}

func GetRoutineWithUserID(userID string) GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Routines.UserID.EQ(uuidFromString(userID))
	}
}

func GetRoutineWithExercises() GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Routine.Exercises()
	}
}

func (r *repo) GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*models.Routine, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	routine, err := models.Routines.Query(query...).One(ctx, r.bobExec())
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

		if err = setRoutineExercises(ctx, tx.bobExec(), routine.ID, nil); err != nil {
			return fmt.Errorf("routine exercises set: %w", err)
		}

		if err = routine.Delete(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("routine delete: %w", err)
		}

		return nil
	})
}

type ListRoutineOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListRoutinesWithPageToken(pageToken []byte) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		newestFirst := sm.OrderBy(models.Routines.Columns.CreatedAt).Desc()
		if pageToken == nil {
			return []bob.Mod[*dialect.SelectQuery]{newestFirst}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.CreatedAt.LT(pt.CreatedAt),
			newestFirst,
		}, nil
	}
}

func ListRoutinesWithName(name string) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.Title.ILike(fmt.Sprintf("%%%s%%", name)),
		}, nil
	}
}

func ListRoutinesWithUserID(userID string) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.UserID.EQ(uuidFromString(userID)),
		}, nil
	}
}

func ListRoutinesWithLimit(limit int) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}, nil
	}
}

func ListRoutinesLoadExercises() ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectThenLoad.Routine.Exercises(),
		}, nil
	}
}

func (r *repo) ListRoutines(ctx context.Context, opts ...ListRoutineOpt) (models.RoutineSlice, error) {
	var query []bob.Mod[*dialect.SelectQuery]
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("routine list opt: %w", err)
		}
		query = append(query, q...)
	}

	routines, err := models.Routines.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("routines fetch: %w", err)
	}

	return routines, nil
}

type UpdateRoutineOpt func() (columns, error)

func UpdateRoutineName(name string) UpdateRoutineOpt {
	return func() (columns, error) {
		return columns{models.Routines.Columns.Title.Name(): name}, nil
	}
}

func UpdateRoutineExerciseOrder(exerciseIDs []string) UpdateRoutineOpt {
	return func() (columns, error) {
		bytes, err := json.Marshal(exerciseIDs)
		if err != nil {
			return nil, fmt.Errorf("exercise IDs marshal: %w", err)
		}

		return columns{models.Routines.Columns.ExerciseOrder.Name(): bytes}, nil
	}
}

func (r *repo) UpdateRoutine(ctx context.Context, routineID string, opts ...UpdateRoutineOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("routine update columns: %w", err)
	}

	return r.NewTx(ctx, func(tx Tx) error {
		mods := append(cols.updateMods(), models.UpdateWhere.Routines.ID.EQ(uuidFromString(routineID)))
		rows, rowsErr := models.Routines.Update(mods...).Exec(ctx, tx.bobExec())
		if rowsErr != nil {
			return fmt.Errorf("routine update: %w", rowsErr)
		}

		if rows > 1 {
			return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
		}

		return nil
	})
}

func (r *repo) AddExerciseToRoutine(ctx context.Context, exercise *models.Exercise, routine *models.Routine) error {
	if _, err := models.ExercisesRoutines.Insert(&models.ExercisesRoutineSetter{
		RoutineID:  omit.From(routine.ID),
		ExerciseID: omit.From(exercise.ID),
	}).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("routine exercises add: %w", err)
	}
	return nil
}

func (r *repo) RemoveExerciseFromRoutine(ctx context.Context, exercise *models.Exercise, routine *models.Routine) error {
	if _, err := models.ExercisesRoutines.Delete(
		models.DeleteWhere.ExercisesRoutines.RoutineID.EQ(routine.ID),
		models.DeleteWhere.ExercisesRoutines.ExerciseID.EQ(exercise.ID),
	).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("routine exercises remove: %w", err)
	}
	return nil
}

type ListWorkoutsOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func (r *repo) ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) (models.WorkoutSlice, error) {
	var query []bob.Mod[*dialect.SelectQuery]
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("workout list opt: %w", err)
		}
		query = append(query, q...)
	}

	workouts, err := models.Workouts.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workouts fetch: %w", err)
	}

	return workouts, nil
}

func ListWorkoutsWithIDs(ids []string) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Workouts.ID.In(uuidsFromStrings(ids)...),
		}, nil
	}
}

func ListWorkoutsLoadUser() ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.Preload.Workout.User(),
		}, nil
	}
}

func ListWorkoutsLoadComments() ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectThenLoad.Workout.WorkoutComments(),
		}, nil
	}
}

func ListWorkoutsLoadSets() ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectThenLoad.Workout.Sets(),
		}, nil
	}
}

func ListWorkoutsWithUserIDs(userIDs ...string) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Workouts.UserID.In(uuidsFromStrings(userIDs)...),
		}, nil
	}
}

func ListWorkoutsWithLimit(size int) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(size),
		}, nil
	}
}

func ListWorkoutsWithPageToken(token []byte) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		newestFirst := sm.OrderBy(models.Workouts.Columns.CreatedAt).Desc()
		if token == nil {
			return []bob.Mod[*dialect.SelectQuery]{newestFirst}, nil
		}

		var pt PageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Workouts.CreatedAt.LT(pt.CreatedAt),
			newestFirst,
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

func (r *repo) CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*models.Workout, error) {
	var workout *models.Workout

	if err := r.NewTx(ctx, func(tx Tx) error {
		var err error
		workout, err = models.Workouts.Insert(&models.WorkoutSetter{
			Name:       omit.From(p.Name),
			Note:       nullIfEmpty(p.Note),
			UserID:     omit.From(uuidFromString(p.UserID)),
			RoutineID:  nullUUIDFromString(p.RoutineID),
			StartedAt:  omit.From(p.StartedAt.Truncate(time.Minute).UTC()),
			FinishedAt: omit.From(p.FinishedAt.Truncate(time.Minute).UTC()),
		}).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("workout insert: %w", err)
		}

		for _, exerciseSet := range p.ExerciseSets {
			sets := make([]*models.SetSetter, 0, len(exerciseSet.Sets))
			for _, set := range exerciseSet.Sets {
				sets = append(sets, &models.SetSetter{
					Reps:            omit.From(safe.Int32FromInt(set.Reps)),
					Weight:          omit.From(set.Weight),
					Distance:        omit.From(set.Distance),
					DurationSeconds: omit.From(safe.Int32FromInt(set.DurationSeconds)),
					UserID:          omit.From(uuidFromString(p.UserID)),
					WorkoutID:       omit.From(workout.ID),
					ExerciseID:      omit.From(uuidFromString(exerciseSet.ExerciseID)),
				})
			}

			if len(sets) == 0 {
				continue
			}

			if _, err = models.Sets.Insert(bob.ToMods(sets...)).Exec(ctx, tx.bobExec()); err != nil {
				return fmt.Errorf("workout sets add: %w", err)
			}
		}

		return nil
	}); err != nil {
		return nil, fmt.Errorf("workout tx: %w", err)
	}

	return workout, nil
}

type GetWorkoutOpt func() bob.Mod[*dialect.SelectQuery]

func GetWorkoutWithID(id string) GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.ID.EQ(uuidFromString(id))
	}
}

func GetWorkoutLoadSets() GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Workout.Sets()
	}
}

func GetWorkoutLoadUser() GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.Workout.User()
	}
}

func GetWorkoutLoadComments() GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Workout.WorkoutComments()
	}
}

func GetWorkoutLoadExercises() GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Workout.Sets(models.Preload.Set.Exercise())
	}
}

func GetWorkoutLoadCommentUsers() GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Workout.WorkoutComments(models.Preload.WorkoutComment.User())
	}
}

func (r *repo) GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*models.Workout, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	workout, err := models.Workouts.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout fetch: %w", err)
	}

	return workout, nil
}

type DeleteWorkoutOpt func() bob.Mod[*dialect.SelectQuery]

func DeleteWorkoutWithID(id string) DeleteWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.ID.EQ(uuidFromString(id))
	}
}

func DeleteWorkoutWithUserID(userID string) DeleteWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.UserID.EQ(uuidFromString(userID))
	}
}

var errDeleteWorkoutMissingOptions = fmt.Errorf("delete workout: missing options")

func (r *repo) DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error {
	if len(opts) == 0 {
		return errDeleteWorkoutMissingOptions
	}

	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	return r.NewTx(ctx, func(tx Tx) error {
		workout, err := models.Workouts.Query(query...).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("workout fetch: %w", err)
		}

		if _, err = models.Sets.Delete(
			models.DeleteWhere.Sets.WorkoutID.EQ(workout.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		if _, err = models.WorkoutComments.Delete(
			models.DeleteWhere.WorkoutComments.WorkoutID.EQ(workout.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("workout comments delete: %w", err)
		}

		if _, err = models.Notifications.Delete(
			dm.Where(psql.Raw("payload ->> 'workoutId' = ?", workout.ID)),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("notifications delete: %w", err)
		}

		if err = workout.Delete(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("workout delete: %w", err)
		}

		return nil
	})
}

func (r *repo) GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []string) (models.SetSlice, error) {
	rawQuery := `
SELECT id FROM public.sets
WHERE (exercise_id, workout_id) IN (
	SELECT DISTINCT ON (exercise_id) exercise_id, workout_id	
	FROM public.sets
	WHERE exercise_id = ANY($1)
	ORDER BY exercise_id, created_at DESC
)
ORDER BY created_at;
`

	rows, err := r.sqlExec().QueryContext(ctx, rawQuery, pq.Array(exerciseIDs))
	if err != nil {
		return nil, fmt.Errorf("previous workout sets fetch: %w", err)
	}

	setIDs, err := scanIDs(rows)
	if err != nil {
		return nil, fmt.Errorf("previous workout sets fetch: %w", err)
	}

	return r.ListSets(
		ctx,
		ListSetsWithID(setIDs...),
		ListSetsLoadExercise(),
		ListSetsOrderByCreatedAt(ASC),
	)
}

func (r *repo) GetPersonalBests(ctx context.Context, userIDs ...string) (models.SetSlice, error) {
	workouts, err := r.ListWorkouts(ctx, ListWorkoutsWithUserIDs(userIDs...))
	if err != nil {
		return nil, fmt.Errorf("workouts fetch: %w", err)
	}

	workoutIDs := make([]string, 0, len(workouts))
	for _, workout := range workouts {
		workoutIDs = append(workoutIDs, workout.ID.String())
	}

	rawQuery := `
	SELECT DISTINCT ON (sets.exercise_id) sets.id
	FROM public.sets
	JOIN public.exercises ON exercises.id = sets.exercise_id
	WHERE sets.workout_id = ANY ($1)
	ORDER BY
		sets.exercise_id,
		CASE WHEN 'weight' = ANY(exercises.metrics) THEN sets.weight ELSE 0 END DESC,
		CASE WHEN 'reps' = ANY(exercises.metrics) THEN sets.reps ELSE 0 END DESC,
		CASE WHEN 'distance' = ANY(exercises.metrics) THEN sets.distance ELSE 0 END DESC,
		CASE WHEN 'time' = ANY(exercises.metrics) THEN sets.duration_seconds ELSE 0 END DESC,
		sets.created_at ASC;
`

	rows, err := r.sqlExec().QueryContext(ctx, rawQuery, pq.Array(workoutIDs))
	if err != nil {
		return nil, fmt.Errorf("sets fetch: %w", err)
	}

	setIDs, err := scanIDs(rows)
	if err != nil {
		return nil, fmt.Errorf("sets fetch: %w", err)
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
		FollowerID: omit.From(uuidFromString(p.FollowerID)),
		FolloweeID: omit.From(uuidFromString(p.FolloweeID)),
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
		models.DeleteWhere.Followers.FollowerID.EQ(uuidFromString(p.FollowerID)),
		models.DeleteWhere.Followers.FolloweeID.EQ(uuidFromString(p.FolloweeID)),
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
		sm.From(models.Followers.NameAsExpr()),
		sm.Where(models.Followers.Columns.FolloweeID.EQ(psql.Arg(userID))),
	)
}

func followeeIDsOf(userID string) bob.Expression {
	return psql.Select(
		sm.Columns(models.Followers.Columns.FolloweeID),
		sm.From(models.Followers.NameAsExpr()),
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
		return models.SelectWhere.Users.ID.EQ(uuidFromString(id))
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
			models.SelectWhere.Users.ID.In(uuidsFromStrings(ids)...),
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

type CreateWorkoutCommentOpts func(comment *models.WorkoutComment) error

func (r *repo) PostCreateWorkoutCommentLoadUser(ctx context.Context) CreateWorkoutCommentOpts {
	return func(comment *models.WorkoutComment) error {
		user, err := models.Users.Query(
			models.SelectWhere.Users.ID.EQ(comment.UserID),
		).One(ctx, r.bobExec())
		if err != nil {
			return fmt.Errorf("user fetch: %w", err)
		}

		comment.R.User = user
		comment.R.Loaded.User = true

		return nil
	}
}

func (r *repo) CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams, opts ...CreateWorkoutCommentOpts) (*models.WorkoutComment, error) {
	comment, err := models.WorkoutComments.Insert(&models.WorkoutCommentSetter{
		UserID:    omit.From(uuidFromString(p.UserID)),
		WorkoutID: omit.From(uuidFromString(p.WorkoutID)),
		Comment:   omit.From(p.Comment),
	}).One(ctx, r.bobExec())
	if err != nil {
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
	EventID   string `json:"eventId,omitempty"`
	WorkoutID string `json:"workoutId,omitempty"`
}

func (r *repo) CreateNotification(ctx context.Context, p CreateNotificationParams) error {
	payload, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("payload marshal: %w", err)
	}

	if _, err = models.Notifications.Insert(
		&models.NotificationSetter{
			UserID:  omit.From(uuidFromString(p.UserID)),
			Type:    omit.From(p.Type),
			Payload: omit.From(bobtypes.NewJSON[json.RawMessage](payload)),
		},
		im.OnConflict().DoNothing(),
	).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("insert: %w", err)
	}

	return nil
}

type GetWorkoutCommentOpt func() bob.Mod[*dialect.SelectQuery]

func GetWorkoutCommentWithID(id string) GetWorkoutCommentOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.WorkoutComments.ID.EQ(uuidFromString(id))
	}
}

func GetWorkoutCommentWithWorkout() GetWorkoutCommentOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.WorkoutComment.Workout()
	}
}

func (r *repo) GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*models.WorkoutComment, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	comment, err := models.WorkoutComments.Query(query...).One(ctx, r.bobExec())
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
			models.SelectWhere.Notifications.UserID.EQ(uuidFromString(userID)),
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
		return models.SelectWhere.Notifications.UserID.EQ(uuidFromString(userID))
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

func (r *repo) MarkNotificationsAsRead(ctx context.Context, userID string, notificationID *string) error {
	setReadAt := um.SetCol(models.Notifications.Columns.ReadAt.Name()).ToArg(time.Now().UTC())
	ownedByUser := models.UpdateWhere.Notifications.UserID.EQ(uuidFromString(userID))
	unread := models.UpdateWhere.Notifications.ReadAt.IsNull()

	updateMods := []bob.Mod[*dialect.UpdateQuery]{setReadAt, ownedByUser, unread}
	if notificationID != nil {
		updateMods = append(
			updateMods,
			models.UpdateWhere.Notifications.ID.EQ(uuidFromString(*notificationID)),
		)
	}

	if _, err := models.Notifications.Update(updateMods...).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("notifications update: %w", err)
	}

	return nil
}

func (r *repo) IsUserFollowedByUserID(ctx context.Context, user *models.User, userID string) (bool, error) {
	exists, err := models.Followers.Query(
		models.SelectWhere.Followers.FolloweeID.EQ(user.ID),
		models.SelectWhere.Followers.FollowerID.EQ(uuidFromString(userID)),
	).Exists(ctx, r.bobExec())
	if err != nil {
		return false, fmt.Errorf("user exists check: %w", err)
	}

	return exists, nil
}

type GetAuthOpt func() bob.Mod[*dialect.SelectQuery]

func GetAuthByID(id string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.ID.EQ(uuidFromString(id))
	}
}

func GetAuthByEmail(email string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.Email.EQ(email)
	}
}

func GetAuthByEmailToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.EmailToken.EQ(uuidFromString(token))
	}
}

func GetAuthWithUser() GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.Auth.User()
	}
}

func GetAuthByPasswordResetToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.PasswordResetToken.EQ(uuidFromString(token))
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

type ListSetsOpt func() (bob.Mod[*dialect.SelectQuery], error)

func ListSetsWithLimit(limit int) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return sm.Limit(limit), nil
	}
}

func ListSetsWithUserID(userID ...string) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.UserID.In(uuidsFromStrings(userID)...), nil
	}
}

func ListSetsWithExerciseID(exerciseID ...string) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.ExerciseID.In(uuidsFromStrings(exerciseID)...), nil
	}
}

func ListSetsWithPageToken(token []byte) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		if token == nil {
			return nil, nil
		}

		var pt PageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return models.SelectWhere.Sets.CreatedAt.LT(pt.CreatedAt), nil
	}
}

func ListSetsWithID(id ...string) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.ID.In(uuidsFromStrings(id)...), nil
	}
}

func ListSetsLoadExercise() ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.Preload.Set.Exercise(), nil
	}
}

func ListSetsOrderByCreatedAt(order order) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		orderBy := sm.OrderBy(models.Sets.Columns.CreatedAt)
		if order == DESC {
			return orderBy.Desc(), nil
		}

		return orderBy.Asc(), nil
	}
}

func (r *repo) ListSets(ctx context.Context, opts ...ListSetsOpt) (models.SetSlice, error) {
	var query []bob.Mod[*dialect.SelectQuery]
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("sets list opt: %w", err)
		}
		if q != nil {
			query = append(query, q)
		}
	}

	sets, err := models.Sets.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("sets fetch: %w", err)
	}

	return sets, nil
}

type UpdateWorkoutOpt func() (columns, error)

func UpdateWorkoutName(name string) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			models.Workouts.Columns.Name.Name(): name,
		}, nil
	}
}

func UpdateWorkoutNote(note string) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			models.Workouts.Columns.Note.Name(): nullIfEmpty(note).GetOrZero(),
		}, nil
	}
}

func UpdateWorkoutStartedAt(startedAt time.Time) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			models.Workouts.Columns.StartedAt.Name(): startedAt,
		}, nil
	}
}

func UpdateWorkoutFinishedAt(finishedAt time.Time) UpdateWorkoutOpt {
	return func() (columns, error) {
		return columns{
			models.Workouts.Columns.FinishedAt.Name(): finishedAt,
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
		mods := append(cols.updateMods(), models.UpdateWhere.Workouts.ID.EQ(uuidFromString(workoutID)))
		rows, rowsErr := models.Workouts.Update(mods...).Exec(ctx, tx.bobExec())
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

		if _, err = models.Sets.Delete(
			models.DeleteWhere.Sets.WorkoutID.EQ(workout.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		var sets []*models.SetSetter
		setCreatedAt := workout.CreatedAt
		for _, exerciseSet := range p.ExerciseSets {
			for _, set := range exerciseSet.Sets {
				sets = append(sets, &models.SetSetter{
					UserID:          omit.From(workout.UserID),
					WorkoutID:       omit.From(workout.ID),
					ExerciseID:      omit.From(uuidFromString(exerciseSet.ExerciseID)),
					Reps:            omit.From(safe.Int32FromInt(set.Reps)),
					Weight:          omit.From(set.Weight),
					Distance:        omit.From(set.Distance),
					DurationSeconds: omit.From(safe.Int32FromInt(set.DurationSeconds)),
					CreatedAt:       omit.From(setCreatedAt),
				})
			}

			// Simulate a rest period between sets.
			const durationSetRest = 2 * time.Minute
			setCreatedAt = setCreatedAt.Add(durationSetRest)
		}

		if len(sets) > 0 {
			if _, err = models.Sets.Insert(bob.ToMods(sets...)).Exec(ctx, tx.bobExec()); err != nil {
				return fmt.Errorf("workout sets add: %w", err)
			}
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
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectThenLoad.Workout.Sets(models.Preload.Set.Exercise()),
		}, nil
	}
}
