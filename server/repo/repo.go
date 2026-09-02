package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/aarondl/opt/omit"
	"github.com/aarondl/opt/omitnull"
	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5/pgconn"
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

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/safe"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
)

type order string

const (
	ASC  order = "ASC"
	DESC order = "DESC"
)

// Repo is the codebase's single persistence adapter: it reads and writes the
// rows every bounded context is stored as, hands back that context's own
// entities, and owns nothing else. Callers declare the narrow slice of it they
// actually depend on.
//
// A Repo bound to a transaction is the same type as one bound to the pool,
// which is what lets a use case hand its collaborators a transactional store
// without either of them knowing which it has.
type Repo struct {
	db *sql.DB
	tx *sql.Tx
}

func (r *Repo) exec() *sql.Tx {
	return r.tx
}

func New(db *sql.DB) *Repo {
	return &Repo{db, nil}
}

// NewTx runs f against a transactional Repo, committing when it returns nil and
// rolling back otherwise. Calls made on an already transactional Repo join the
// transaction they are already in rather than opening another.
func (r *Repo) NewTx(ctx context.Context, f func(tx *Repo) error) error {
	if r.tx != nil {
		return f(r)
	}

	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	if err = f(&Repo{nil, tx}); err != nil {
		if errRollback := tx.Rollback(); errRollback != nil {
			return fmt.Errorf("rollback tx: %w", errors.Join(err, errRollback))
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
func (r *Repo) sqlExec() sqlExecutor {
	if r.tx != nil {
		return r.tx
	}

	return r.db
}

// scanIDs collects the single id column a raw query projects.
func scanIDs(rows *sql.Rows) ([]uuid.UUID, error) {
	defer func() { _ = rows.Close() }()

	var ids []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
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
func (r *Repo) bobExec() bob.Executor {
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

func (r *Repo) CreateAuth(ctx context.Context, email, password string) (*account.Auth, error) {
	address := account.NormalizeEmailAddress(email)
	exists, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(address),
	).Exists(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("email exists check: %w", err)
	}
	if exists {
		return nil, account.ErrEmailAlreadyRegistered
	}

	bcryptPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("bcrypt password generation: %w", err)
	}

	auth, err := models.Auths.Insert(&models.AuthSetter{
		Email:    omit.From(address),
		Password: omit.From(bcryptPassword),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("auth insert: %w", err)
	}

	return authFromRow(auth), nil
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

func UpdateAuthEmailVerificationSentAt() UpdateAuthOpt {
	return func() (columns, error) {
		return columns{models.Auths.Columns.EmailVerificationSentAt.Name(): time.Now().UTC()}, nil
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

func UpdateAuthPasswordResetToken(token uuid.UUID) UpdateAuthOpt {
	return func() (columns, error) {
		return columns{
			models.Auths.Columns.PasswordResetToken.Name():           token,
			models.Auths.Columns.PasswordResetTokenValidUntil.Name(): time.Now().UTC().Add(account.PasswordResetTokenTTL),
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

func (r *Repo) UpdateAuth(ctx context.Context, authID uuid.UUID, opts ...UpdateAuthOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("auth update columns: %w", err)
	}

	mods := append(cols.updateMods(), um.Where(models.Auths.Columns.ID.EQ(psql.Arg(authID))))
	rows, err := models.Auths.Update(mods...).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("auth update: %w", err)
	}

	if rows != 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

// unmatchableHash is a bcrypt hash of an unguessable string, at the cost every
// stored password uses. It gives an email that matches no row the same work an
// email that does costs, so the response time stops saying which is which.
const unmatchableHash = "$2a$10$sK44yiS/oOhlzCNmn65OM.jUuFbAy3IGA0JABRo6MIlVMdVm26s5a"

func (r *Repo) CompareEmailAndPassword(ctx context.Context, email, password string) error {
	auth, err := models.Auths.Query(
		models.SelectWhere.Auths.Email.EQ(account.NormalizeEmailAddress(email)),
	).One(ctx, r.bobExec())
	if err != nil {
		// Deliberately discarded: the comparison exists to spend the time, and
		// nothing can match this hash.
		_ = bcrypt.CompareHashAndPassword([]byte(unmatchableHash), []byte(password))
		return fmt.Errorf("auth fetch: %w", err)
	}

	if err = bcrypt.CompareHashAndPassword(auth.Password, []byte(password)); err != nil {
		return fmt.Errorf("hash and password comparison: %w", err)
	}

	return nil
}

func (r *Repo) RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error) {
	exists, err := models.Auths.Query(
		models.SelectWhere.Auths.RefreshToken.EQ(refreshToken),
	).Exists(ctx, r.bobExec())
	if err != nil {
		return false, fmt.Errorf("refresh token exists check: %w", err)
	}
	return exists, nil
}

type CreateUserParams struct {
	AuthID   uuid.UUID
	Name     string
	Username string
}

// CreateUser starts every account metric; the units are a profile setting from
// then on.
func (r *Repo) CreateUser(ctx context.Context, p CreateUserParams) (*account.User, error) {
	user, err := models.Users.Insert(&models.UserSetter{
		AuthID:       omit.From(p.AuthID),
		Name:         omit.From(p.Name),
		Username:     omit.From(account.NormalizeUsername(p.Username)),
		WeightUnit:   omit.From(string(weightunit.Kilograms)),
		DistanceUnit: omit.From(string(distanceunit.Kilometers)),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("user insert: %w", translateUserError(err))
	}

	return userFromRow(user), nil
}

// Usernames are compared case-insensitively, so uniqueness is enforced by an
// index on lower(username) rather than a column constraint. That index is not
// in the generated dberrors vocabulary, so its violation is translated here.
func translateUserError(err error) error {
	if uniqueViolation(err, "idx_users_username_lower") {
		return account.ErrUsernameTaken
	}

	return err
}

// uniqueViolation reports whether err is Postgres refusing a duplicate under
// the named unique index or constraint.
func uniqueViolation(err error, name string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == name
}

type UpdateUserOpt func() (columns, error)

func UpdateUserUsername(username string) UpdateUserOpt {
	return func() (columns, error) {
		return columns{models.Users.Columns.Username.Name(): account.NormalizeUsername(username)}, nil
	}
}

func UpdateUserName(name string) UpdateUserOpt {
	return func() (columns, error) {
		return columns{models.Users.Columns.Name.Name(): strings.TrimSpace(name)}, nil
	}
}

func UpdateUserWeightUnit(unit string) UpdateUserOpt {
	return func() (columns, error) {
		return columns{models.Users.Columns.WeightUnit.Name(): string(weightunit.Normalize(unit))}, nil
	}
}

func UpdateUserAutofillSets(enabled bool) UpdateUserOpt {
	return func() (columns, error) {
		return columns{models.Users.Columns.AutofillSets.Name(): enabled}, nil
	}
}

func UpdateUserDistanceUnit(unit string) UpdateUserOpt {
	return func() (columns, error) {
		return columns{models.Users.Columns.DistanceUnit.Name(): string(distanceunit.Normalize(unit))}, nil
	}
}

func (r *Repo) UpdateUser(ctx context.Context, userID uuid.UUID, opts ...UpdateUserOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("user update columns: %w", err)
	}

	mods := append(cols.updateMods(), models.UpdateWhere.Users.ID.EQ(userID))
	rows, err := models.Users.Update(mods...).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("user update: %w", translateUserError(err))
	}

	if rows != 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

// DeleteUser erases an account and everything it owns.
//
// The owned rows go with the auth row through ON DELETE CASCADE, so the only
// thing to sweep by hand is what other people's rows say about the account:
// notifications naming it as their actor, which the notification list would
// silently skip while the unread badge kept counting them.
func (r *Repo) DeleteUser(ctx context.Context, userID uuid.UUID) error {
	return r.NewTx(ctx, func(tx *Repo) error {
		user, err := models.Users.Query(
			models.SelectWhere.Users.ID.EQ(userID),
		).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("user fetch: %w", err)
		}

		if _, err = models.Notifications.Delete(
			dm.Where(psql.Raw("payload ->> 'actorId' = ?", userID)),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("actor notifications delete: %w", err)
		}

		if _, err = models.Auths.Delete(
			models.DeleteWhere.Auths.ID.EQ(user.AuthID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("auth delete: %w", err)
		}

		return nil
	})
}

type CreateExerciseParams struct {
	UserID  uuid.UUID
	Name    string
	Tags    []string
	Metrics []string
}

func (r *Repo) CreateExercise(ctx context.Context, p CreateExerciseParams) (*training.Exercise, error) {
	// Preserve the original exercise behaviour for internal and older callers
	// that predate configurable measurements: a conventional weights lift.
	if len(p.Metrics) == 0 {
		p.Metrics = []string{"weight", "reps"}
	}
	if p.Tags == nil {
		p.Tags = []string{}
	}
	exercise, err := models.Exercises.Insert(&models.ExerciseSetter{
		UserID:  omit.From(p.UserID),
		Title:   omit.From(p.Name),
		Tags:    omit.From(pq.StringArray(p.Tags)),
		Metrics: omit.From(pq.StringArray(p.Metrics)),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercise insert: %w", err)
	}

	return exerciseFromRow(exercise), nil
}

type SoftDeleteExerciseParams struct {
	UserID     uuid.UUID
	ExerciseID uuid.UUID
}

func (r *Repo) SoftDeleteExercise(ctx context.Context, p SoftDeleteExerciseParams) error {
	return r.NewTx(ctx, func(tx *Repo) error {
		exercise, err := models.Exercises.Query(
			models.SelectWhere.Exercises.ID.EQ(p.ExerciseID),
			models.SelectWhere.Exercises.UserID.EQ(p.UserID),
		).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("exercise fetch: %w", err)
		}

		// Deleting the join rows leaves position gaps in the affected routines,
		// which the ordered read tolerates: the remaining exercises keep their
		// relative order.
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
		ordered := newestFirst(models.Exercises.Columns.CreatedAt, models.Exercises.Columns.ID)
		if pageToken == nil {
			return ordered, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return append([]bob.Mod[*dialect.SelectQuery]{
			pageTokenBoundary(models.Exercises.Columns.CreatedAt, models.Exercises.Columns.ID, pt),
		}, ordered...), nil
	}
}

func ListExercisesWithoutDeleted() ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.DeletedAt.IsNull(),
		}, nil
	}
}

func ListExercisesWithIDs(ids []uuid.UUID) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		if len(ids) == 0 {
			return nil, nil
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.ID.In(ids...),
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

func ListExercisesWithUserID(userID uuid.UUID) ListExercisesOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Exercises.UserID.EQ(userID),
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

func (r *Repo) ListExercises(ctx context.Context, opts ...ListExercisesOpt) ([]*training.Exercise, error) {
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

	return exercisesFromRows(exercises), nil
}

type GetExerciseOpt func() bob.Mod[*dialect.SelectQuery]

func GetExerciseWithID(id uuid.UUID) GetExerciseOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Exercises.ID.EQ(id)
	}
}

func GetExerciseWithUserID(userID uuid.UUID) GetExerciseOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Exercises.UserID.EQ(userID)
	}
}

func (r *Repo) GetExercise(ctx context.Context, opts ...GetExerciseOpt) (*training.Exercise, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	exercise, err := models.Exercises.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercise fetch: %w", err)
	}
	return exerciseFromRow(exercise), nil
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

func (r *Repo) UpdateExercise(ctx context.Context, exerciseID uuid.UUID, opts ...UpdateExerciseOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("exercise update columns: %w", err)
	}

	mods := append(cols.updateMods(), models.UpdateWhere.Exercises.ID.EQ(exerciseID))
	rows, err := models.Exercises.Update(mods...).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("exercise update: %w", err)
	}

	if rows > 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

type CreateRoutineParams struct {
	UserID      uuid.UUID
	Name        string
	ExerciseIDs []uuid.UUID
	// Optional. When empty the routine gets a single straight-sets group
	// holding every exercise in ExerciseIDs.
	Groups []training.RoutineGroupDraft
}

var (
	ErrRoutineExerciseBelongsToAnotherUser = fmt.Errorf("exercise does not belong to user")
	ErrRoutineExerciseDeleted              = fmt.Errorf("exercise is deleted")
)

func (r *Repo) CreateRoutine(ctx context.Context, p CreateRoutineParams) (*training.Routine, error) {
	exercises, err := models.Exercises.Query(
		models.SelectWhere.Exercises.ID.In(p.ExerciseIDs...),
	).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("exercises fetch: %w", err)
	}

	for _, exercise := range exercises {
		if exercise.UserID != p.UserID {
			return nil, ErrRoutineExerciseBelongsToAnotherUser
		}
		if !exercise.DeletedAt.IsNull() {
			return nil, ErrRoutineExerciseDeleted
		}
	}

	var routine *models.Routine
	if err = r.NewTx(ctx, func(tx *Repo) error {
		routine, err = models.Routines.Insert(&models.RoutineSetter{
			UserID: omit.From(p.UserID),
			Title:  omit.From(p.Name),
		}).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("routine insert: %w", err)
		}

		ordered := training.OrderExercisesByIDs(exercisesFromRows(exercises), p.ExerciseIDs)
		exerciseIDs := make([]uuid.UUID, 0, len(ordered))
		for _, exercise := range ordered {
			exerciseIDs = append(exerciseIDs, exercise.ID)
		}

		if err = setRoutineGroups(
			ctx, tx.bobExec(), routine.ID, training.NormalizeRoutineGroups(p.Groups, exerciseIDs), ordered,
		); err != nil {
			return fmt.Errorf("routine groups set: %w", err)
		}
		return nil
	}); err != nil {
		return nil, fmt.Errorf("routine tx: %w", err)
	}

	return routineFromRow(routine), nil
}

type GetRoutineOpt func() bob.Mod[*dialect.SelectQuery]

func GetRoutineWithID(id uuid.UUID) GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Routines.ID.EQ(id)
	}
}

func GetRoutineWithUserID(userID uuid.UUID) GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Routines.UserID.EQ(userID)
	}
}

func GetRoutineWithExercises() GetRoutineOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectThenLoad.Routine.Exercises(stableExerciseOrder()...)
	}
}

// newestFirst orders a paged list by creation time, breaking ties on the primary key. created_at
// alone is not a total order — the seed writes one timestamp across every row it creates in a
// transaction, and two rows written in the same millisecond tie in production too — and Postgres is
// then free to hand tied rows back in whatever order they physically sit in, which any write to the
// table changes. Whichever routine comes back first is the one the app offers up next, so a tie
// moves the home, workout and training screens at once. See stableExerciseOrder.
func newestFirst(createdAt, id any) []bob.Mod[*dialect.SelectQuery] {
	return []bob.Mod[*dialect.SelectQuery]{
		sm.OrderBy(createdAt).Desc(),
		sm.OrderBy(id).Desc(),
	}
}

// pageTokenBoundary keeps the rows strictly after the token's place in the
// newest-first (created_at, id) order. A token from before cursors carried an
// id compares on the timestamp alone, which skips rows tied with the boundary
// — the reason the id is there.
func pageTokenBoundary(createdAt, id bob.Expression, pt PageToken) bob.Mod[*dialect.SelectQuery] {
	if pt.ID.IsNil() {
		return sm.Where(psql.Group(createdAt).LT(psql.Arg(pt.CreatedAt)))
	}

	return sm.Where(psql.Group(createdAt, id).
		LT(psql.Group(psql.Arg(pt.CreatedAt), psql.Arg(pt.ID))))
}

// stableExerciseOrder orders a routine's exercise load by the position recorded on the
// relationship table, which the load's join makes available to ORDER BY. Positions may have gaps
// after removals; only their relative order matters. The exercise ID keeps the sort total in case
// two rows ever share a position.
func stableExerciseOrder() []bob.Mod[*dialect.SelectQuery] {
	return []bob.Mod[*dialect.SelectQuery]{
		sm.OrderBy(models.ExercisesRoutines.Columns.Position).Asc(),
		sm.OrderBy(models.ExercisesRoutines.Columns.ExerciseID).Asc(),
	}
}

// GetRoutine never returns a retired routine. The filter is baked in rather
// than offered as an option: a caller that forgot it would hand the app a
// routine the athlete has deleted, which is how a plan's rotation came to
// point at one.
func (r *Repo) GetRoutine(ctx context.Context, opts ...GetRoutineOpt) (*training.Routine, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts)+1)
	query = append(query, models.SelectWhere.Routines.DeletedAt.IsNull())
	for _, opt := range opts {
		query = append(query, opt())
	}

	routine, err := models.Routines.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("routine fetch: %w", err)
	}

	return routineFromRow(routine), nil
}

// SoftDeleteRoutine retires a routine rather than erasing it, the way an
// exercise is retired: the row stays so the workouts that trained it still
// resolve, while every plan that rotated through it drops it and keeps
// pointing at the routine it was on.
func (r *Repo) SoftDeleteRoutine(ctx context.Context, id uuid.UUID) error {
	return r.NewTx(ctx, func(tx *Repo) error {
		routine, err := tx.GetRoutine(ctx, GetRoutineWithID(id))
		if err != nil {
			return fmt.Errorf("routine fetch: %w", err)
		}

		if err = tx.dropRoutineFromPlans(ctx, routine); err != nil {
			return err
		}

		if _, err = models.Routines.Update(
			um.SetCol(models.Routines.Columns.DeletedAt.Name()).ToArg(time.Now().UTC()),
			models.UpdateWhere.Routines.ID.EQ(routine.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("routine soft delete: %w", err)
		}

		return nil
	})
}

type ListRoutineOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListRoutinesWithPageToken(pageToken []byte) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		ordered := newestFirst(models.Routines.Columns.CreatedAt, models.Routines.Columns.ID)
		if pageToken == nil {
			return ordered, nil
		}

		var pt PageToken
		if err := json.Unmarshal(pageToken, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return append([]bob.Mod[*dialect.SelectQuery]{
			pageTokenBoundary(models.Routines.Columns.CreatedAt, models.Routines.Columns.ID, pt),
		}, ordered...), nil
	}
}

func ListRoutinesWithName(name string) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.Title.ILike(fmt.Sprintf("%%%s%%", name)),
		}, nil
	}
}

func ListRoutinesWithIDs(ids []uuid.UUID) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		if len(ids) == 0 {
			return nil, nil
		}

		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.ID.In(ids...),
		}, nil
	}
}

func ListRoutinesWithUserID(userID uuid.UUID) ListRoutineOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Routines.UserID.EQ(userID),
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
			models.SelectThenLoad.Routine.Exercises(stableExerciseOrder()...),
		}, nil
	}
}

// ListRoutines never returns retired routines. See GetRoutine.
func (r *Repo) ListRoutines(ctx context.Context, opts ...ListRoutineOpt) ([]*training.Routine, error) {
	query := []bob.Mod[*dialect.SelectQuery]{models.SelectWhere.Routines.DeletedAt.IsNull()}
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

	return routinesFromRows(routines), nil
}

type UpdateRoutineOpt func() (columns, error)

func UpdateRoutineName(name string) UpdateRoutineOpt {
	return func() (columns, error) {
		return columns{models.Routines.Columns.Title.Name(): name}, nil
	}
}

func (r *Repo) UpdateRoutine(ctx context.Context, routineID uuid.UUID, opts ...UpdateRoutineOpt) error {
	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("routine update columns: %w", err)
	}

	mods := append(cols.updateMods(), models.UpdateWhere.Routines.ID.EQ(routineID))
	rows, err := models.Routines.Update(mods...).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("routine update: %w", err)
	}

	if rows > 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

// UpdateRoutineExerciseOrder rewrites the positions of a routine's exercises to match the given ID
// order. The single statement keeps the rewrite atomic; IDs that match no row are ignored, so the
// caller is expected to have validated the set.
func (r *Repo) UpdateRoutineExerciseOrder(ctx context.Context, routineID uuid.UUID, exerciseIDs []uuid.UUID) error {
	if _, err := r.sqlExec().ExecContext(ctx, `
UPDATE public.exercises_routines er
SET position = ordered.position
FROM unnest($2::uuid[]) WITH ORDINALITY AS ordered(exercise_id, position)
WHERE er.routine_id = $1
  AND er.exercise_id = ordered.exercise_id`, routineID, pq.Array(exerciseIDs)); err != nil {
		return fmt.Errorf("routine exercise order update: %w", err)
	}

	return nil
}

// AddExerciseToRoutine appends the exercise to the routine by inserting it after the routine's
// current last position, which puts it in the routine's last group.
func (r *Repo) AddExerciseToRoutine(ctx context.Context, exercise *training.Exercise, routine *training.Routine) error {
	if err := ensureRoutineGroup(ctx, r.sqlExec(), routine.ID); err != nil {
		return err
	}

	if _, err := r.sqlExec().ExecContext(
		ctx, `
INSERT INTO public.exercises_routines (routine_id, exercise_id, position, group_id, rest_seconds)
SELECT $1, $2, COALESCE(MAX(er.position), 0) + 1,
       (SELECT id FROM public.routine_groups WHERE routine_id = $1 ORDER BY position DESC LIMIT 1),
       $3
FROM public.exercises_routines er
WHERE er.routine_id = $1`,
		routine.ID, exercise.ID, training.NewOccurrenceRestSeconds(exercise.Metrics),
	); err != nil {
		return fmt.Errorf("routine exercises add: %w", err)
	}

	return nil
}

type ListWorkoutsOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func (r *Repo) ListWorkouts(ctx context.Context, opts ...ListWorkoutsOpt) ([]*training.Workout, error) {
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

	return workoutsFromRows(workouts), nil
}

// CountWorkouts is every workout the user has ever logged. Callers that show a
// lifetime figure want this rather than the length of a listed page.
func (r *Repo) CountWorkouts(ctx context.Context, userID uuid.UUID) (int64, error) {
	count, err := models.Workouts.Query(
		models.SelectWhere.Workouts.UserID.EQ(userID),
	).Count(ctx, r.bobExec())
	if err != nil {
		return 0, fmt.Errorf("workouts count: %w", err)
	}

	return count, nil
}

func ListWorkoutsWithIDs(ids []uuid.UUID) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Workouts.ID.In(ids...),
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

func ListWorkoutsWithUserIDs(userIDs ...uuid.UUID) ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Workouts.UserID.In(userIDs...),
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
		ordered := newestFirst(models.Workouts.Columns.CreatedAt, models.Workouts.Columns.ID)
		if token == nil {
			return ordered, nil
		}

		var pt PageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return append([]bob.Mod[*dialect.SelectQuery]{
			pageTokenBoundary(models.Workouts.Columns.CreatedAt, models.Workouts.Columns.ID, pt),
		}, ordered...), nil
	}
}

type CreateWorkoutParams struct {
	Name         string
	Note         string
	UserID       uuid.UUID
	RoutineID    uuid.UUID
	ExerciseSets []ExerciseSet
	// Groups is how the session was trained, resolved against ExerciseSets. An
	// empty slice stores the workout ungrouped.
	Groups     []training.WorkoutGroup
	StartedAt  time.Time
	FinishedAt time.Time
	// IdempotencyKey names the save attempt. A key this user already saved
	// under is rejected with training.ErrWorkoutAlreadySaved; a nil one is
	// stored as none and never a repeat.
	IdempotencyKey uuid.UUID
}

type ExerciseSet struct {
	ExerciseID uuid.UUID
	Sets       []Set
}

type Set struct {
	Reps            int
	Weight          float64
	Distance        float64
	DurationSeconds int
	WeightUnit      string
	DistanceUnit    string
}

func (r *Repo) CreateWorkout(ctx context.Context, p CreateWorkoutParams) (*training.Workout, error) {
	var workout *models.Workout

	if err := r.NewTx(ctx, func(tx *Repo) error {
		var err error
		workout, err = models.Workouts.Insert(&models.WorkoutSetter{
			Name:       omit.From(p.Name),
			Note:       nullIfEmpty(p.Note),
			UserID:     omit.From(p.UserID),
			RoutineID:  nullUUID(p.RoutineID),
			StartedAt:  omit.From(p.StartedAt.Truncate(time.Minute).UTC()),
			FinishedAt: omit.From(p.FinishedAt.Truncate(time.Minute).UTC()),

			IdempotencyKey: nullUUID(p.IdempotencyKey),
		}).One(ctx, tx.bobExec())
		if err != nil {
			return fmt.Errorf("workout insert: %w", translateWorkoutError(err))
		}

		occurrences, err := writeWorkoutGroups(ctx, tx.bobExec(), workout.ID, p.Groups)
		if err != nil {
			return err
		}

		for _, exerciseSet := range p.ExerciseSets {
			sets := make([]*models.SetSetter, 0, len(exerciseSet.Sets))
			for position, set := range exerciseSet.Sets {
				sets = append(sets, &models.SetSetter{
					Reps:            omit.From(safe.Int32FromInt(set.Reps)),
					Weight:          omit.From(weightunit.ToKilograms(set.Weight, set.WeightUnit)),
					WeightUnit:      omit.From(string(weightunit.Normalize(set.WeightUnit))),
					Distance:        omit.From(distanceunit.ToKilometers(set.Distance, set.DistanceUnit)),
					DistanceUnit:    omit.From(string(distanceunit.Normalize(set.DistanceUnit))),
					DurationSeconds: omit.From(safe.Int32FromInt(set.DurationSeconds)),
					UserID:          omit.From(p.UserID),
					WorkoutID:       omit.From(workout.ID),
					ExerciseID:      omit.From(exerciseSet.ExerciseID),
					// The order the session logged them in, which is what a
					// circuit's rounds are read off; every set of a workout
					// shares created_at, so it cannot answer.
					Position: omit.From(safe.Int32FromInt(position)),
					WorkoutGroupExerciseID: occurrenceOf(occurrences, setOccurrence{
						exerciseID: exerciseSet.ExerciseID,
						position:   position,
					}),
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

	return workoutFromRow(workout), nil
}

// A repeated save trips the unique index on (user_id, idempotency_key). An
// index rather than a constraint, so it is outside the generated dberrors
// vocabulary and its violation is translated here.
func translateWorkoutError(err error) error {
	if uniqueViolation(err, "workouts_user_id_idempotency_key_idx") {
		return training.ErrWorkoutAlreadySaved
	}

	return err
}

type GetWorkoutOpt func() bob.Mod[*dialect.SelectQuery]

func GetWorkoutWithID(id uuid.UUID) GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.ID.EQ(id)
	}
}

func GetWorkoutWithUserID(userID uuid.UUID) GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.UserID.EQ(userID)
	}
}

func GetWorkoutWithIdempotencyKey(key uuid.UUID) GetWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.IdempotencyKey.EQ(key)
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

func (r *Repo) GetWorkout(ctx context.Context, opts ...GetWorkoutOpt) (*training.Workout, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	workout, err := models.Workouts.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout fetch: %w", err)
	}

	return workoutFromRow(workout), nil
}

type DeleteWorkoutOpt func() bob.Mod[*dialect.SelectQuery]

func DeleteWorkoutWithID(id uuid.UUID) DeleteWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.ID.EQ(id)
	}
}

func DeleteWorkoutWithUserID(userID uuid.UUID) DeleteWorkoutOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Workouts.UserID.EQ(userID)
	}
}

var errDeleteWorkoutMissingOptions = fmt.Errorf("delete workout: missing options")

func (r *Repo) DeleteWorkout(ctx context.Context, opts ...DeleteWorkoutOpt) error {
	if len(opts) == 0 {
		return errDeleteWorkoutMissingOptions
	}

	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	return r.NewTx(ctx, func(tx *Repo) error {
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

func (r *Repo) GetPreviousWorkoutSets(ctx context.Context, exerciseIDs []uuid.UUID) ([]*training.Set, error) {
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

func (r *Repo) GetPersonalBests(ctx context.Context, userIDs ...uuid.UUID) ([]*training.Set, error) {
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
	FollowerID uuid.UUID
	FolloweeID uuid.UUID
}

func (r *Repo) Follow(ctx context.Context, p FollowParams) error {
	if _, err := models.Followers.Insert(&models.FollowerSetter{
		FollowerID: omit.From(p.FollowerID),
		FolloweeID: omit.From(p.FolloweeID),
	}).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("follow add: %w", err)
	}

	return nil
}

type UnfollowParams struct {
	FollowerID uuid.UUID
	FolloweeID uuid.UUID
}

func (r *Repo) Unfollow(ctx context.Context, p UnfollowParams) error {
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
func followerIDsOf(userID uuid.UUID) bob.Expression {
	return psql.Select(
		sm.Columns(models.Followers.Columns.FollowerID),
		sm.From(models.Followers.NameAsExpr()),
		sm.Where(models.Followers.Columns.FolloweeID.EQ(psql.Arg(userID))),
	)
}

func followeeIDsOf(userID uuid.UUID) bob.Expression {
	return psql.Select(
		sm.Columns(models.Followers.Columns.FolloweeID),
		sm.From(models.Followers.NameAsExpr()),
		sm.Where(models.Followers.Columns.FollowerID.EQ(psql.Arg(userID))),
	)
}

func (r *Repo) ListFollowers(ctx context.Context, userID uuid.UUID) ([]*account.User, error) {
	query := []bob.Mod[*dialect.SelectQuery]{
		sm.Where(models.Users.Columns.ID.In(followerIDsOf(userID))),
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return usersFromRows(users), nil
}

func (r *Repo) ListFollowees(ctx context.Context, userID uuid.UUID) ([]*account.User, error) {
	query := []bob.Mod[*dialect.SelectQuery]{
		sm.Where(models.Users.Columns.ID.In(followeeIDsOf(userID))),
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return usersFromRows(users), nil
}

type GetUserOpt func() bob.Mod[*dialect.SelectQuery]

func GetUserWithID(id uuid.UUID) GetUserOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Users.ID.EQ(id)
	}
}

func GetUserLoadAuth() GetUserOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.User.Auth()
	}
}

func (r *Repo) GetUser(ctx context.Context, opts ...GetUserOpt) (*account.User, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	user, err := models.Users.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("user fetch: %w", err)
	}

	return userFromRow(user), nil
}

type ListUsersOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListUsersWithIDs(ids []uuid.UUID) ListUsersOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Users.ID.In(ids...),
		}, nil
	}
}

// userSearchRank scores a name and a username against the search query. The
// ordering and the page token's cursor are both built from it, so the two
// cannot drift into describing different rankings.
func userSearchRank(name, username any, query string) bob.Expression {
	return psql.F(
		"greatest",
		psql.F("similarity", name, psql.Arg(query)),
		psql.F("similarity", username, psql.Arg(query)),
	)
}

// ListUsersWithNameMatching matches the query against both the name and the
// username, closest name matches first. Both stored values are lowercase.
func ListUsersWithNameMatching(query string) ListUsersOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		pattern := psql.Arg(fmt.Sprintf("%%%s%%", strings.ToLower(query)))
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Where(models.Users.Columns.FullNameSearch.Like(pattern).Or(
				models.Users.Columns.Username.Like(pattern),
			)),
			sm.OrderBy(userSearchRank(
				models.Users.Columns.FullNameSearch, models.Users.Columns.Username, query,
			)).Desc(),
			// Equal scores are common, so the ID breaks the tie: without a
			// total order a page token names a group of rows rather than one.
			sm.OrderBy(models.Users.Columns.ID).Desc(),
		}, nil
	}
}

// userSearchCursor aliases the copy of the users table the page token scores,
// keeping its columns apart from the row being ranked.
const userSearchCursor = "cursor"

// UserSearchPageToken is a place in one search's ranking. The ranking depends
// on the query, so the token names the last user of the page and the next query
// re-scores that user, rather than carrying a score no other query agrees with.
type UserSearchPageToken struct {
	ID uuid.UUID `json:"id"`
}

// ListUsersWithPageToken resumes a name search after the user the token names.
// It must be given the query the token was issued for; ordering by any other
// ranking would make the cursor meaningless. A cursor whose user has since been
// deleted scores NULL and ends the list, rather than repeating a page.
func ListUsersWithPageToken(query string, token []byte) ListUsersOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		if len(token) == 0 {
			return nil, nil
		}

		var pt UserSearchPageToken
		if err := json.Unmarshal(token, &pt); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		cursorID := psql.Arg(pt.ID)
		cursorRank := psql.Select(
			sm.Columns(userSearchRank(
				psql.Quote(userSearchCursor, models.Users.Columns.FullNameSearch.Name()),
				psql.Quote(userSearchCursor, models.Users.Columns.Username.Name()),
				query,
			)),
			sm.From("users").As(userSearchCursor),
			sm.Where(psql.Quote(userSearchCursor, models.Users.Columns.ID.Name()).EQ(cursorID)),
		)

		rank := userSearchRank(models.Users.Columns.FullNameSearch, models.Users.Columns.Username, query)

		return []bob.Mod[*dialect.SelectQuery]{
			sm.Where(psql.Group(rank, models.Users.Columns.ID).
				LT(psql.Group(psql.Group(cursorRank), cursorID))),
		}, nil
	}
}

func ListUsersWithLimit(limit int) ListUsersOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}, nil
	}
}

func (r *Repo) ListUsers(ctx context.Context, opts ...ListUsersOpt) ([]*account.User, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		q, err := opt()
		if err != nil {
			return nil, fmt.Errorf("user list opt: %w", err)
		}
		query = append(query, q...)
	}

	users, err := models.Users.Query(query...).All(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("users fetch: %w", err)
	}

	return usersFromRows(users), nil
}

type CreateWorkoutCommentParams struct {
	UserID    uuid.UUID
	WorkoutID uuid.UUID
	Comment   string
}

type CreateWorkoutCommentOpts func(comment *training.WorkoutComment) error

func (r *Repo) PostCreateWorkoutCommentLoadUser(ctx context.Context) CreateWorkoutCommentOpts {
	return func(comment *training.WorkoutComment) error {
		user, err := models.Users.Query(
			models.SelectWhere.Users.ID.EQ(comment.UserID),
		).One(ctx, r.bobExec())
		if err != nil {
			return fmt.Errorf("user fetch: %w", err)
		}

		comment.User = userFromRow(user)

		return nil
	}
}

func (r *Repo) CreateWorkoutComment(ctx context.Context, p CreateWorkoutCommentParams, opts ...CreateWorkoutCommentOpts) (*training.WorkoutComment, error) {
	inserted, err := models.WorkoutComments.Insert(&models.WorkoutCommentSetter{
		UserID:    omit.From(p.UserID),
		WorkoutID: omit.From(p.WorkoutID),
		Comment:   omit.From(p.Comment),
	}).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout comment insert: %w", err)
	}

	comment := workoutCommentFromRow(inserted)
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

func (r *Repo) StoreTrace(ctx context.Context, p StoreTraceParams) error {
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
	Type    notification.Type
	UserID  uuid.UUID
	Payload notification.Payload
}

func (r *Repo) CreateNotification(ctx context.Context, p CreateNotificationParams) error {
	payload, err := json.Marshal(p.Payload)
	if err != nil {
		return fmt.Errorf("payload marshal: %w", err)
	}

	if _, err = models.Notifications.Insert(
		&models.NotificationSetter{
			UserID:  omit.From(p.UserID),
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

func GetWorkoutCommentWithID(id uuid.UUID) GetWorkoutCommentOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.WorkoutComments.ID.EQ(id)
	}
}

func GetWorkoutCommentWithWorkout() GetWorkoutCommentOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.WorkoutComment.Workout()
	}
}

func (r *Repo) GetWorkoutComment(ctx context.Context, opts ...GetWorkoutCommentOpt) (*training.WorkoutComment, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	comment, err := models.WorkoutComments.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("workout comment fetch: %w", err)
	}

	return workoutCommentFromRow(comment), nil
}

type ListNotificationsOpt func() ([]bob.Mod[*dialect.SelectQuery], error)

func ListNotificationsWithLimit(limit int) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			sm.Limit(limit),
		}, nil
	}
}

func ListNotificationsWithUserID(userID uuid.UUID) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectWhere.Notifications.UserID.EQ(userID),
		}, nil
	}
}

func ListNotificationsWithPageToken(token []byte) ListNotificationsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		ordered := newestFirst(models.Notifications.Columns.CreatedAt, models.Notifications.Columns.ID)
		if len(token) == 0 {
			return ordered, nil
		}

		var pageToken PageToken
		if err := json.Unmarshal(token, &pageToken); err != nil {
			return nil, fmt.Errorf("page token unmarshal: %w", err)
		}

		return append([]bob.Mod[*dialect.SelectQuery]{
			pageTokenBoundary(models.Notifications.Columns.CreatedAt, models.Notifications.Columns.ID, pageToken),
		}, ordered...), nil
	}
}

func (r *Repo) ListNotifications(ctx context.Context, opts ...ListNotificationsOpt) ([]*notification.Notification, error) {
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

	return notificationsFromRows(notifications)
}

type CountNotificationsOpt func() bob.Mod[*dialect.SelectQuery]

func CountNotificationsWithUserID(userID uuid.UUID) CountNotificationsOpt {
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

func (r *Repo) CountNotifications(ctx context.Context, opts ...CountNotificationsOpt) (int64, error) {
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

func (r *Repo) MarkNotificationsAsRead(ctx context.Context, userID uuid.UUID, notificationID *uuid.UUID) error {
	setReadAt := um.SetCol(models.Notifications.Columns.ReadAt.Name()).ToArg(time.Now().UTC())
	ownedByUser := models.UpdateWhere.Notifications.UserID.EQ(userID)
	unread := models.UpdateWhere.Notifications.ReadAt.IsNull()

	updateMods := []bob.Mod[*dialect.UpdateQuery]{setReadAt, ownedByUser, unread}
	if notificationID != nil {
		updateMods = append(
			updateMods,
			models.UpdateWhere.Notifications.ID.EQ(*notificationID),
		)
	}

	if _, err := models.Notifications.Update(updateMods...).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("notifications update: %w", err)
	}

	return nil
}

// MarkFeedAsSeen records that the athlete has the home feed in front of them
// now, which is the line the feed draws between what is new and what is not.
func (r *Repo) MarkFeedAsSeen(ctx context.Context, userID uuid.UUID) error {
	rows, err := models.Users.Update(
		um.SetCol(models.Users.Columns.FeedSeenAt.Name()).ToArg(time.Now().UTC()),
		models.UpdateWhere.Users.ID.EQ(userID),
	).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("user feed seen update: %w", err)
	}

	if rows != 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

func (r *Repo) IsUserFollowedByUserID(ctx context.Context, user *account.User, userID uuid.UUID) (bool, error) {
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

func GetAuthByEmail(email string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.Email.EQ(account.NormalizeEmailAddress(email))
	}
}

func GetAuthByEmailToken(token uuid.UUID) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.EmailToken.EQ(token)
	}
}

func GetAuthWithUser() GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.Preload.Auth.User()
	}
}

func GetAuthByPasswordResetToken(token uuid.UUID) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.PasswordResetToken.EQ(token)
	}
}

func GetAuthByRefreshToken(token string) GetAuthOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Auths.RefreshToken.EQ(token)
	}
}

func (r *Repo) GetAuth(ctx context.Context, opts ...GetAuthOpt) (*account.Auth, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	auth, err := models.Auths.Query(query...).One(ctx, r.bobExec())
	if err != nil {
		return nil, fmt.Errorf("auth fetch: %w", err)
	}

	return authFromRow(auth), nil
}

type ListSetsOpt func() (bob.Mod[*dialect.SelectQuery], error)

func ListSetsWithLimit(limit int) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return sm.Limit(limit), nil
	}
}

func ListSetsWithUserID(userID ...uuid.UUID) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.UserID.In(userID...), nil
	}
}

func ListSetsWithExerciseID(exerciseID ...uuid.UUID) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.ExerciseID.In(exerciseID...), nil
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

		return pageTokenBoundary(models.Sets.Columns.CreatedAt, models.Sets.Columns.ID, pt), nil
	}
}

func ListSetsWithID(id ...uuid.UUID) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.SelectWhere.Sets.ID.In(id...), nil
	}
}

func ListSetsLoadExercise() ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		return models.Preload.Set.Exercise(), nil
	}
}

// ListSetsOrderByCreatedAt orders by creation time with the ID keeping the
// order total: every set of a workout shares created_at, so without it Postgres
// hands the tied rows back in whatever order they physically sit in.
func ListSetsOrderByCreatedAt(order order) ListSetsOpt {
	return func() (bob.Mod[*dialect.SelectQuery], error) {
		createdAt := sm.OrderBy(models.Sets.Columns.CreatedAt)
		id := sm.OrderBy(models.Sets.Columns.ID)
		if order == DESC {
			return bob.Mods[*dialect.SelectQuery]{createdAt.Desc(), id.Desc()}, nil
		}

		return bob.Mods[*dialect.SelectQuery]{createdAt.Asc(), id.Asc()}, nil
	}
}

func (r *Repo) ListSets(ctx context.Context, opts ...ListSetsOpt) ([]*training.Set, error) {
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

	return setsFromRows(sets), nil
}

type CountSetsOpt func() bob.Mod[*dialect.SelectQuery]

func CountSetsWithExerciseID(exerciseID uuid.UUID) CountSetsOpt {
	return func() bob.Mod[*dialect.SelectQuery] {
		return models.SelectWhere.Sets.ExerciseID.EQ(exerciseID)
	}
}

func (r *Repo) CountSets(ctx context.Context, opts ...CountSetsOpt) (int64, error) {
	query := make([]bob.Mod[*dialect.SelectQuery], 0, len(opts))
	for _, opt := range opts {
		query = append(query, opt())
	}

	count, err := models.Sets.Query(query...).Count(ctx, r.bobExec())
	if err != nil {
		return 0, fmt.Errorf("sets count: %w", err)
	}

	return count, nil
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

func (r *Repo) UpdateWorkout(ctx context.Context, workoutID uuid.UUID, opts ...UpdateWorkoutOpt) error {
	if _, err := r.GetWorkout(ctx, GetWorkoutWithID(workoutID)); err != nil {
		return fmt.Errorf("workout fetch: %w", err)
	}

	cols, err := updateColumnsFromOpts(opts)
	if err != nil {
		return fmt.Errorf("workout update columns: %w", err)
	}

	mods := append(cols.updateMods(), models.UpdateWhere.Workouts.ID.EQ(workoutID))
	rows, err := models.Workouts.Update(mods...).Exec(ctx, r.bobExec())
	if err != nil {
		return fmt.Errorf("workout update: %w", err)
	}

	if rows > 1 {
		return fmt.Errorf("%w: expected 1, got %d", ErrUpdateRowsAffected, rows)
	}

	return nil
}

type UpdateWorkoutSetsParams struct {
	WorkoutID    uuid.UUID
	ExerciseSets []ExerciseSet
}

func (r *Repo) UpdateWorkoutSets(ctx context.Context, p UpdateWorkoutSetsParams) error {
	return r.NewTx(ctx, func(tx *Repo) error {
		workout, err := r.GetWorkout(
			ctx,
			GetWorkoutWithID(p.WorkoutID),
			GetWorkoutLoadSets(),
		)
		if err != nil {
			return fmt.Errorf("workout fetch: %w", err)
		}

		// The rows are rewritten, so which block logged each of them has to be
		// carried across: an edit changes what was lifted, never how the
		// session was structured.
		occurrences := setOccurrencesOf(workout.Sets)

		if _, err = models.Sets.Delete(
			models.DeleteWhere.Sets.WorkoutID.EQ(workout.ID),
		).Exec(ctx, tx.bobExec()); err != nil {
			return fmt.Errorf("workout sets delete: %w", err)
		}

		var sets []*models.SetSetter
		setCreatedAt := workout.CreatedAt
		for _, exerciseSet := range p.ExerciseSets {
			for position, set := range exerciseSet.Sets {
				sets = append(sets, &models.SetSetter{
					UserID:          omit.From(workout.UserID),
					WorkoutID:       omit.From(workout.ID),
					ExerciseID:      omit.From(exerciseSet.ExerciseID),
					Reps:            omit.From(safe.Int32FromInt(set.Reps)),
					Weight:          omit.From(weightunit.ToKilograms(set.Weight, set.WeightUnit)),
					WeightUnit:      omit.From(string(weightunit.Normalize(set.WeightUnit))),
					Distance:        omit.From(distanceunit.ToKilometers(set.Distance, set.DistanceUnit)),
					DistanceUnit:    omit.From(string(distanceunit.Normalize(set.DistanceUnit))),
					DurationSeconds: omit.From(safe.Int32FromInt(set.DurationSeconds)),
					CreatedAt:       omit.From(setCreatedAt),
					Position:        omit.From(safe.Int32FromInt(position)),
					// A set the edit added is beyond every block the session
					// held, so it is stored ungrouped.
					WorkoutGroupExerciseID: occurrenceOf(occurrences, setOccurrence{
						exerciseID: exerciseSet.ExerciseID,
						position:   position,
					}),
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

func (r *Repo) PublishEvent(ctx context.Context, topic events.Topic, payload []byte) error {
	if !topic.Valid() {
		return fmt.Errorf("%w: %s", ErrInvalidTopic, topic)
	}

	if len(payload) == 0 {
		return ErrEmptyPayload
	}

	if _, err := models.Events.Insert(&models.EventSetter{
		Topic:   omit.From(topic),
		Payload: omit.From(bobtypes.NewJSON[json.RawMessage](payload)),
	}).Exec(ctx, r.bobExec()); err != nil {
		return fmt.Errorf("event insert: %w", err)
	}

	return nil
}

func ListWorkoutsLoadExercises() ListWorkoutsOpt {
	return func() ([]bob.Mod[*dialect.SelectQuery], error) {
		return []bob.Mod[*dialect.SelectQuery]{
			models.SelectThenLoad.Workout.Sets(models.Preload.Set.Exercise()),
		}, nil
	}
}
