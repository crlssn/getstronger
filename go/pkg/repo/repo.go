package repo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/boil"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/go/pkg/orm"
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
		return fmt.Errorf("hash and password comparision: %w", err)
	}

	return nil
}

func (r *Repo) FromEmail(ctx context.Context, email string) (*orm.Auth, error) {
	return orm.Auths(orm.AuthWhere.Email.EQ(email)).One(ctx, r.executor())
}

func (r *Repo) UpdateRefreshToken(ctx context.Context, authID string, refreshToken string) error {
	auth := &orm.Auth{
		ID:           authID,
		RefreshToken: null.StringFrom(refreshToken),
	}
	_, err := auth.Update(ctx, r.executor(), boil.Whitelist(orm.AuthColumns.RefreshToken))
	return err
}

func (r *Repo) DeleteRefreshToken(ctx context.Context, refreshToken string) error {
	_, err := orm.Auths(
		orm.AuthWhere.RefreshToken.EQ(null.StringFrom(refreshToken)),
	).UpdateAll(ctx, r.executor(), orm.M{
		orm.AuthColumns.RefreshToken: nil,
	})
	return err
}

func (r *Repo) RefreshTokenExists(ctx context.Context, refreshToken string) (bool, error) {
	return orm.Auths(orm.AuthWhere.RefreshToken.EQ(null.StringFrom(refreshToken))).Exists(ctx, r.executor())
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

	return user.Insert(ctx, r.executor(), boil.Infer())
}

type CreateExerciseParams struct {
	UserID          string
	Name            string
	Label           string
	RestBetweenSets int16
}

func (r *Repo) CreateExercise(ctx context.Context, p CreateExerciseParams) (*orm.Exercise, error) {
	exercise := &orm.Exercise{
		UserID:          p.UserID,
		Title:           p.Name,
		SubTitle:        null.NewString(p.Label, p.Label != ""),
		RestBetweenSets: null.NewInt16(p.RestBetweenSets, p.RestBetweenSets > 0),
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
	_, err := orm.Exercises(
		orm.ExerciseWhere.ID.EQ(p.ExerciseID),
		orm.ExerciseWhere.UserID.EQ(p.UserID),
	).UpdateAll(ctx, r.executor(), orm.M{
		orm.ExerciseColumns.DeletedAt: null.TimeFrom(time.Now().UTC()),
	})
	return err
}

type ListExercisesParams struct {
	UserID    string
	Name      null.String
	Limit     int
	PageToken []byte
	//PageToken *PageToken
}

//type Pagination struct {
//	Limit     int
//	PageToken PageToken
//}

type pageToken struct {
	CreatedAt time.Time `json:"created_at"`
}

func (r *Repo) ListExercises(ctx context.Context, p ListExercisesParams) (orm.ExerciseSlice, []byte, error) {
	query := []qm.QueryMod{
		orm.ExerciseWhere.UserID.EQ(p.UserID),
		orm.ExerciseWhere.DeletedAt.IsNull(),
		qm.OrderBy(fmt.Sprintf("%s DESC", orm.ExerciseColumns.CreatedAt)),
		qm.Limit(p.Limit + 1), // Fetch one more to check if there are more pages.
	}

	if p.Name.Valid {
		query = append(query, orm.ExerciseWhere.Title.ILIKE(fmt.Sprintf("%%%s%%", p.Name.String)))
	}

	if p.PageToken != nil {
		var pt pageToken
		if err := json.Unmarshal(p.PageToken, &pt); err != nil {
			return nil, nil, fmt.Errorf("page token unmarshal: %w", err)
		}
		query = append(query, orm.ExerciseWhere.CreatedAt.LT(pt.CreatedAt))
	}

	boil.DebugMode = true
	exercises, err := orm.Exercises(query...).All(ctx, r.executor())
	if err != nil {
		return nil, nil, fmt.Errorf("exercises fetch: %w", err)
	}
	boil.DebugMode = false

	if len(exercises) > p.Limit {
		pt, ptErr := json.Marshal(pageToken{CreatedAt: exercises[p.Limit-1].CreatedAt})
		if ptErr != nil {
			return nil, nil, fmt.Errorf("page token marshal: %w", ptErr)
		}

		return exercises[:p.Limit], pt, nil
	}

	return exercises, nil, nil
}

func (r *Repo) FindExercise(ctx context.Context, id string) (*orm.Exercise, error) {
	return orm.FindExercise(ctx, r.executor(), id)
}

func (r *Repo) UpdateExercise(ctx context.Context, exercise *orm.Exercise) error {
	_, err := exercise.Update(ctx, r.executor(), boil.Whitelist(
		orm.ExerciseColumns.Title,
		orm.ExerciseColumns.SubTitle,
		orm.ExerciseColumns.RestBetweenSets,
	))
	return err
}
