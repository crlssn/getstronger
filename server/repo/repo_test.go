//nolint:all
package repo_test

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/aarondl/opt/null"
	"github.com/aarondl/opt/omit"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/gofrs/uuid/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/lib/pq"
	"github.com/stretchr/testify/require"
	"github.com/stretchr/testify/suite"
	"golang.org/x/crypto/bcrypt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql"
	"github.com/stephenafamo/bob/dialect/psql/sm"
	bobtypes "github.com/stephenafamo/bob/types"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/distanceunit"
	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/notification"
	"github.com/crlssn/getstronger/server/pubsub/events"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/training"
	"github.com/crlssn/getstronger/server/weightunit"
)

type repoSuite struct {
	suite.Suite

	repo *repo.Repo

	container *container.Container
	factory   *factory.Factory
}

func TestRepoSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(repoSuite))
}

func (s *repoSuite) SetupSuite() {
	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.repo = repo.New(s.container.DB)
	s.T().Cleanup(func() {
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
		}
	})
}

var errTxError = errors.New("error")

func (s *repoSuite) TestNewTx() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		tx       func(tx *repo.Repo) error
		expected expected
	}

	emailCreated := gofakeit.Email()
	emailNotCreated := gofakeit.Email()

	tests := []test{
		{
			name: "ok_transaction_committed",
			tx: func(tx *repo.Repo) error {
				_, err := tx.CreateAuth(context.Background(), emailCreated, "password")
				s.Require().NoError(err)
				return nil
			},
			expected: expected{err: nil},
		},
		{
			name: "err_transaction_not_committed",
			tx: func(tx *repo.Repo) error {
				_, err := tx.CreateAuth(context.Background(), emailNotCreated, "password")
				s.Require().NoError(err)
				return errTxError
			},
			expected: expected{err: errTxError},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			err := s.repo.NewTx(context.Background(), t.tx)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				exists, existsErr := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(emailNotCreated)).Exists(context.Background(), bob.NewDB(s.container.DB))
				s.Require().NoError(existsErr)
				s.Require().False(exists)
				return
			}
			s.Require().NoError(err)
			exists, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(emailCreated)).Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().True(exists)
		})
	}
}

var errRollbackError = errors.New("rollback error")

// rollbackFailConnector backs a database/sql handle whose transactions
// cannot roll back, to exercise NewTx's rollback-failure branch.
type rollbackFailConnector struct{}

func (rollbackFailConnector) Connect(context.Context) (driver.Conn, error) {
	return rollbackFailConn{}, nil
}
func (rollbackFailConnector) Driver() driver.Driver { return nil }

type rollbackFailConn struct{}

func (rollbackFailConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (rollbackFailConn) Close() error              { return nil }
func (rollbackFailConn) Begin() (driver.Tx, error) { return rollbackFailTx{}, nil }

type rollbackFailTx struct{}

func (rollbackFailTx) Commit() error   { return nil }
func (rollbackFailTx) Rollback() error { return errRollbackError }

func TestNewTxRollbackFailure(t *testing.T) {
	t.Parallel()

	r := repo.New(sql.OpenDB(rollbackFailConnector{}))
	err := r.NewTx(context.Background(), func(*repo.Repo) error {
		return errTxError
	})

	// Both the causal error and the rollback error must survive in the chain.
	require.ErrorIs(t, err, errTxError)
	require.ErrorIs(t, err, errRollbackError)
}

func (s *repoSuite) TestCreateAuth() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		email    string
		password string
		init     func(test)
		expected expected
	}

	tests := []test{
		{
			name:     "ok_auth_created",
			email:    gofakeit.Email(),
			password: "password",
			init:     func(_ test) {},
			expected: expected{
				err: nil,
			},
		},
		{
			name:     "ok_email_normalized_to_lowercase",
			email:    " Mixed." + gofakeit.Email(),
			password: "password",
			init:     func(_ test) {},
			expected: expected{
				err: nil,
			},
		},
		{
			name:     "err_email_already_exists",
			email:    gofakeit.Email(),
			password: "password",
			init: func(t test) {
				s.factory.NewAuth(factory.AuthEmail(t.email))
			},
			expected: expected{
				err: account.ErrEmailAlreadyRegistered,
			},
		},
		{
			name:     "err_email_already_exists_case_insensitively",
			email:    "Alice." + gofakeit.Email(),
			password: "password",
			init: func(t test) {
				s.factory.NewAuth(factory.AuthEmail(strings.ToLower(t.email)))
			},
			expected: expected{
				err: account.ErrEmailAlreadyRegistered,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			auth, err := s.repo.CreateAuth(context.Background(), t.email, t.password)
			if t.expected.err != nil {
				s.Require().Nil(auth)
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)
			s.Require().NotNil(auth)
			// The address is stored folded, so one mailbox stays one account
			// however the athlete typed it.
			s.Require().Equal(account.NormalizeEmailAddress(t.email), auth.Email)
			// The hash never leaves the store, so the row is where to check it.
			row, err := models.FindAuth(context.Background(), bob.NewDB(s.container.DB), auth.ID)
			s.Require().NoError(err)
			s.Require().NoError(bcrypt.CompareHashAndPassword(row.Password, []byte(t.password)))
		})
	}
}

// The application folds addresses on the way in, so a case-variant duplicate
// can only arrive by racing the existence check. The index is what refuses it.
func (s *repoSuite) TestAuthEmailIsUniqueCaseInsensitively() {
	ctx := context.Background()
	address := gofakeit.Email()
	s.factory.NewAuth(factory.AuthEmail(address))

	_, err := models.Auths.Insert(&models.AuthSetter{
		Email:    omit.From(strings.ToUpper(address)),
		Password: omit.From(repo.MustHashPassword("password")),
	}).One(ctx, bob.NewDB(s.container.DB))

	var pgErr *pgconn.PgError
	s.Require().ErrorAs(err, &pgErr)
	s.Require().Equal("idx_auth_email_lower", pgErr.ConstraintName)
}

func (s *repoSuite) TestUpdateAuth() {
	type expected struct {
		err      error
		auth     *models.Auth
		password string
	}

	type test struct {
		name     string
		init     func(*test)
		expected expected
		authID   uuid.UUID
		opts     []repo.UpdateAuthOpt
	}

	tests := []test{
		{
			name:   "ok_update_auth_password",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthPassword("new_password"),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(factory.AuthID(t.authID))
			},
			expected: expected{
				err:      nil,
				password: "new_password",
			},
		},
		{
			name:   "ok_update_auth_email_verified",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthEmailVerified(),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(factory.AuthID(t.authID))
				t.expected.auth.EmailVerified = true
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "ok_update_auth_password_reset_token",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthPasswordResetToken(factory.UUID(0)),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(
					factory.AuthID(t.authID),
					factory.AuthPasswordResetToken(factory.UUID(0), account.PasswordResetTokenTTL),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "ok_update_auth_delete_password_reset_token",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthDeletePasswordResetToken(),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(
					factory.AuthID(t.authID),
				)
				t.expected.auth.PasswordResetToken = null.Val[uuid.UUID]{}
				t.expected.auth.PasswordResetTokenValidUntil = null.Val[time.Time]{}
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "ok_update_auth_refresh_token",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthRefreshToken("refresh_token"),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(factory.AuthID(t.authID))
				t.expected.auth.RefreshToken = null.From("refresh_token")
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "ok_update_auth_delete_refresh_token",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthDeleteRefreshToken(),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(
					factory.AuthID(t.authID),
					factory.AuthRefreshToken("refresh_token"),
				)
				t.expected.auth.RefreshToken = null.Val[string]{}
				t.expected.auth.PasswordResetTokenValidUntil = null.Val[time.Time]{}
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "err_auth_does_not_exist",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthEmailVerified(),
			},
			init: func(_ *test) {},
			expected: expected{
				err: repo.ErrUpdateRowsAffected,
			},
		},
		{
			name:   "err_duplicate_options",
			authID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthEmailVerified(),
				repo.UpdateAuthEmailVerified(),
			},
			init: func(_ *test) {},
			expected: expected{
				err: repo.ErrUpdateDuplicateColumn,
			},
		},
		{
			name:   "err_missing_options",
			authID: uuid.Must(uuid.NewV4()),
			opts:   nil,
			init:   func(_ *test) {},
			expected: expected{
				err: repo.ErrUpdateNoColumns,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(&t)
			err := s.repo.UpdateAuth(context.Background(), t.authID, t.opts...)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)

			auth, err := models.FindAuth(context.Background(), bob.NewDB(s.container.DB), t.authID)
			s.Require().NoError(err)
			s.Require().Equal(t.expected.auth.Email, auth.Email)
			s.Require().Equal(t.expected.auth.EmailVerified, auth.EmailVerified)
			s.Require().Equal(t.expected.auth.RefreshToken.IsNull(), auth.RefreshToken.IsNull())
			s.Require().Equal(t.expected.auth.RefreshToken.GetOrZero(), auth.RefreshToken.GetOrZero())
			s.Require().Equal(t.expected.auth.PasswordResetToken.IsNull(), auth.PasswordResetToken.IsNull())
			s.Require().Equal(t.expected.auth.PasswordResetToken.GetOrZero(), auth.PasswordResetToken.GetOrZero())
			s.Require().Equal(t.expected.auth.PasswordResetTokenValidUntil.IsNull(), auth.PasswordResetTokenValidUntil.IsNull())
			s.Require().WithinDuration(
				t.expected.auth.PasswordResetTokenValidUntil.GetOrZero(),
				auth.PasswordResetTokenValidUntil.GetOrZero(),
				time.Second,
			)
			if t.expected.password != "" {
				s.Require().NoError(bcrypt.CompareHashAndPassword(auth.Password, []byte(t.expected.password)))
			}
		})
	}
}

func (s *repoSuite) TestCompareEmailAndPassword() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		email    string
		password string
		init     func(test)
		expected expected
	}

	tests := []test{
		{
			name:     "ok_valid_email_and_password",
			email:    gofakeit.Email(),
			password: "valid_password",
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthEmail(t.email),
					factory.AuthPassword(t.password),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:     "ok_email_matched_case_insensitively",
			email:    "Bob." + gofakeit.Email(),
			password: "valid_password",
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthEmail(strings.ToLower(t.email)),
					factory.AuthPassword(t.password),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:     "err_invalid_email",
			email:    gofakeit.Email(),
			password: "valid_password",
			init:     func(_ test) {},
			expected: expected{
				err: sql.ErrNoRows,
			},
		},
		{
			name:     "err_invalid_password",
			email:    gofakeit.Email(),
			password: "wrong_password",
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthEmail(t.email),
					factory.AuthPassword("actual_password"),
				)
			},
			expected: expected{
				err: bcrypt.ErrMismatchedHashAndPassword,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			err := s.repo.CompareEmailAndPassword(context.Background(), t.email, t.password)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)
		})
	}
}

// An email that matches no row must still cost a bcrypt comparison, or the
// response time tells anyone with a stopwatch which addresses are registered.
//
// The bar is what a comparison costs on the machine running this, taken as the
// cheapest of a few so that a runner descheduling one of them cannot raise it.
// Timing the registered path instead weighed two numbers that both wander, and
// a busy runner put them at a ratio of 0.48.
func (s *repoSuite) TestCompareEmailAndPasswordHidesUnregisteredEmails() {
	hashed := repo.MustHashPassword("actual_password")

	comparison := time.Hour
	for range 3 {
		start := time.Now()
		_ = bcrypt.CompareHashAndPassword(hashed, []byte("wrong_password"))
		comparison = min(comparison, time.Since(start))
	}

	start := time.Now()
	err := s.repo.CompareEmailAndPassword(context.Background(), gofakeit.Email(), "wrong_password")
	unregistered := time.Since(start)
	s.Require().ErrorIs(err, sql.ErrNoRows)

	// Half a comparison sits far above the sub-millisecond lookup an early
	// return takes and far below the work this path should be doing.
	s.Require().Greater(unregistered, comparison/2)
}

func (s *repoSuite) TestRefreshTokenExists() {
	type expected struct {
		exists bool
		err    error
	}

	type test struct {
		name         string
		refreshToken string
		init         func(test)
		expected     expected
	}

	tests := []test{
		{
			name:         "ok_token_exists",
			refreshToken: "valid_refresh_token",
			init: func(t test) {
				s.factory.NewAuth(factory.AuthRefreshToken(t.refreshToken))
			},
			expected: expected{
				exists: true,
				err:    nil,
			},
		},
		{
			name:         "ok_token_does_not_exist",
			refreshToken: "nonexistent_refresh_token",
			init:         func(_ test) {},
			expected: expected{
				exists: false,
				err:    nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			exists, err := s.repo.RefreshTokenExists(context.Background(), t.refreshToken)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				s.Require().False(exists)
				return
			}

			s.Require().NoError(err)
			s.Require().Equal(t.expected.exists, exists)
		})
	}
}

func (s *repoSuite) TestCreateUser() {
	type expected struct {
		user *models.User
		err  error
	}

	type test struct {
		name     string
		params   repo.CreateUserParams
		init     func(test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_user_created",
			params: repo.CreateUserParams{
				AuthID:   s.factory.NewAuth().ID,
				Name:     "John Doe",
				Username: "john",
			},
			init: func(_ test) {},
			expected: expected{
				user: &models.User{
					Name:     "John Doe",
					Username: "john",
				},
				err: nil,
			},
		},
		{
			name: "ok_username_normalized_to_lowercase",
			params: repo.CreateUserParams{
				AuthID:   s.factory.NewAuth().ID,
				Name:     "John Casing",
				Username: " John.Casing ",
			},
			init: func(_ test) {},
			expected: expected{
				user: &models.User{
					Name:     "John Casing",
					Username: "john.casing",
				},
				err: nil,
			},
		},
		{
			name: "err_username_exists_case_insensitively",
			params: repo.CreateUserParams{
				AuthID:   s.factory.NewAuth().ID,
				Name:     "John Dupe",
				Username: "Taken",
			},
			init: func(_ test) {
				s.factory.NewUser(factory.UserUsername("taken"))
			},
			expected: expected{
				user: nil,
				err:  account.ErrUsernameTaken,
			},
		},
		{
			name: "err_auth_id_missing",
			params: repo.CreateUserParams{
				AuthID:   uuid.Nil,
				Name:     "John Doe",
				Username: "john2",
			},
			init: func(_ test) {},
			expected: expected{
				user: nil,
				err:  fmt.Errorf("user insert: ERROR: insert or update on table \"users\" violates foreign key constraint \"users_auth_id_fkey\" (SQLSTATE 23503)"),
			},
		},
		{
			name: "err_unknown_auth_id",
			params: repo.CreateUserParams{
				AuthID:   uuid.Must(uuid.NewV4()),
				Name:     "Jane Doe",
				Username: "jane2",
			},
			init: func(_ test) {},
			expected: expected{
				user: nil,
				err:  fmt.Errorf("user insert: ERROR: insert or update on table \"users\" violates foreign key constraint \"users_auth_id_fkey\" (SQLSTATE 23503)"),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			user, err := s.repo.CreateUser(context.Background(), t.params)

			if t.expected.err != nil {
				s.Require().Error(err)
				if errors.Is(t.expected.err, account.ErrUsernameTaken) {
					s.Require().ErrorIs(err, account.ErrUsernameTaken)
				} else {
					s.Require().ErrorContains(err, t.expected.err.Error())
				}
				s.Require().Nil(user)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(user)
			s.Require().Equal(t.params.AuthID, user.AuthID)
			s.Require().Equal(t.expected.user.Name, user.Name)
			s.Require().Equal(t.expected.user.Username, user.Username)
			s.Require().Equal(weightunit.Kilograms, user.WeightUnit)
			s.Require().Equal(distanceunit.Kilometers, user.DistanceUnit)
		})
	}
}

func (s *repoSuite) TestListUsersWithNameMatching() {
	user := s.factory.NewUser(
		factory.UserName("Search Target"),
		factory.UserUsername("clearlyunrelated"),
	)

	byName, err := s.repo.ListUsers(context.Background(), repo.ListUsersWithNameMatching("search tar"))
	s.Require().NoError(err)
	s.Require().Len(byName, 1)
	s.Require().Equal(user.ID, byName[0].ID)

	byUsername, err := s.repo.ListUsers(context.Background(), repo.ListUsersWithNameMatching("clearlyunrel"))
	s.Require().NoError(err)
	s.Require().Len(byUsername, 1)
	s.Require().Equal(user.ID, byUsername[0].ID)
}

func (s *repoSuite) TestUpdateUser() {
	type expected struct {
		err        error
		name       string
		weightUnit string
	}

	type test struct {
		name     string
		init     func(*test)
		opts     []repo.UpdateUserOpt
		userID   uuid.UUID
		expected expected
	}

	tests := []test{
		{
			name: "ok_update_weight_unit_pounds",
			opts: []repo.UpdateUserOpt{
				repo.UpdateUserWeightUnit(string(weightunit.Pounds)),
			},
			init: func(t *test) {
				t.userID = s.factory.NewUser(factory.UserWeightUnit(weightunit.Kilograms)).ID
			},
			expected: expected{
				err:        nil,
				weightUnit: string(weightunit.Pounds),
			},
		},
		{
			name: "ok_update_weight_unit_normalizes_unknown_value",
			opts: []repo.UpdateUserOpt{
				repo.UpdateUserWeightUnit("stone"),
			},
			init: func(t *test) {
				t.userID = s.factory.NewUser(factory.UserWeightUnit(weightunit.Pounds)).ID
			},
			expected: expected{
				err:        nil,
				weightUnit: string(weightunit.Kilograms),
			},
		},
		{
			name: "ok_update_name_trims_surrounding_whitespace",
			opts: []repo.UpdateUserOpt{
				repo.UpdateUserName("  Robin  Fields  "),
			},
			init: func(t *test) {
				t.userID = s.factory.NewUser().ID
			},
			expected: expected{
				err:  nil,
				name: "Robin  Fields",
			},
		},
		{
			name:   "err_unknown_user_id",
			userID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateUserOpt{
				repo.UpdateUserWeightUnit(string(weightunit.Pounds)),
			},
			init: func(_ *test) {},
			expected: expected{
				err: repo.ErrUpdateRowsAffected,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(&t)
			err := s.repo.UpdateUser(context.Background(), t.userID, t.opts...)

			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			user, err := models.Users.Query(models.SelectWhere.Users.ID.EQ(t.userID)).One(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			if t.expected.name != "" {
				s.Require().Equal(t.expected.name, user.Name)
				return
			}

			s.Require().Equal(t.expected.weightUnit, user.WeightUnit)
		})
	}
}

func (s *repoSuite) TestCreateExercise() {
	type expected struct {
		exercise *models.Exercise
		err      error
	}

	type test struct {
		name     string
		params   repo.CreateExerciseParams
		init     func(test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_exercise_created_with_tags",
			params: repo.CreateExerciseParams{
				UserID: s.factory.NewUser().ID,
				Name:   "Bench Press",
				Tags:   []string{"Chest", "Barbell"},
			},
			init: func(_ test) {},
			expected: expected{
				exercise: &models.Exercise{
					Title: "Bench Press",
					Tags:  pq.StringArray{"Chest", "Barbell"},
				},
				err: nil,
			},
		},
		{
			name: "ok_exercise_created_without_tags",
			params: repo.CreateExerciseParams{
				UserID: s.factory.NewUser().ID,
				Name:   "Squat",
				Tags:   nil,
			},
			init: func(_ test) {},
			expected: expected{
				exercise: &models.Exercise{
					Title: "Squat",
					Tags:  pq.StringArray{},
				},
				err: nil,
			},
		},
		{
			name: "err_unknown_user_id",
			params: repo.CreateExerciseParams{
				UserID: uuid.Must(uuid.NewV4()),
				Name:   "Deadlift",
				Tags:   []string{"Back"},
			},
			init: func(_ test) {},
			expected: expected{
				exercise: nil,
				err:      fmt.Errorf("exercise insert"),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			exercise, err := s.repo.CreateExercise(context.Background(), t.params)

			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorContains(err, t.expected.err.Error())
				s.Require().Nil(exercise)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(exercise)
			s.Require().Equal(t.params.UserID, exercise.UserID)
			s.Require().Equal(t.expected.exercise.Title, exercise.Name)
			s.Require().ElementsMatch(t.expected.exercise.Tags, exercise.Tags)
		})
	}
}

func (s *repoSuite) TestSoftDeleteExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		params   repo.SoftDeleteExerciseParams
		init     func(test) (models.RoutineSlice, []string)
		expected expected
	}

	tests := []test{
		{
			name: "ok_soft_delete_exercise_with_routines",
			params: repo.SoftDeleteExerciseParams{
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.Must(uuid.NewV4()),
			},
			init: func(t test) (models.RoutineSlice, []string) {
				exercises := models.ExerciseSlice{
					s.factory.NewExercise(
						factory.ExerciseUserID(t.params.UserID),
					),
					s.factory.NewExercise(
						factory.ExerciseID(t.params.ExerciseID),
						factory.ExerciseUserID(t.params.UserID),
					),
					s.factory.NewExercise(
						factory.ExerciseUserID(t.params.UserID),
					),
				}

				routines := models.RoutineSlice{
					s.factory.NewRoutine(),
					s.factory.NewRoutine(),
				}

				// The deleted exercise sits between the two survivors so the
				// order check below proves their relative order is untouched.
				s.factory.AddRoutineExercise(routines[0], exercises...)
				s.factory.AddRoutineExercise(routines[1], exercises...)

				return routines, []string{exercises[0].ID.String(), exercises[2].ID.String()}
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "ok_soft_delete_exercise_without_routines",
			params: repo.SoftDeleteExerciseParams{
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.Must(uuid.NewV4()),
			},
			init: func(t test) (models.RoutineSlice, []string) {
				s.factory.NewExercise(
					factory.ExerciseID(t.params.ExerciseID),
					factory.ExerciseUserID(t.params.UserID),
				)
				return nil, nil
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_exercise_not_found",
			params: repo.SoftDeleteExerciseParams{
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.Must(uuid.NewV4()),
			},
			expected: expected{
				err: sql.ErrNoRows,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			var routines models.RoutineSlice
			var remainingIDs []string
			if t.init != nil {
				routines, remainingIDs = t.init(t)
			}

			err := s.repo.SoftDeleteExercise(context.Background(), t.params)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)

			exists, err := models.Exercises.Query(
				models.SelectWhere.Exercises.ID.EQ(t.params.ExerciseID),
				models.SelectWhere.Exercises.DeletedAt.IsNull(),
			).Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)

			s.Require().NoError(routines.ReloadAll(context.Background(), bob.NewDB(s.container.DB)))
			for _, routine := range routines {
				fetched, fetchErr := s.repo.GetRoutine(
					context.Background(),
					repo.GetRoutineWithID(routine.ID),
					repo.GetRoutineWithExercises(),
				)
				s.Require().NoError(fetchErr)

				exerciseIDs := make([]string, 0, len(fetched.Exercises))
				for _, exercise := range fetched.Exercises {
					exerciseIDs = append(exerciseIDs, exercise.ID.String())
				}
				s.Require().Equal(remainingIDs, exerciseIDs, "the remaining exercises should keep their relative order")
			}
		})
	}
}

func (s *repoSuite) TestListExercises() {
	type expected struct {
		err           error
		exercises     int
		nextPageToken bool
	}

	type test struct {
		name     string
		opts     []repo.ListExercisesOpt
		init     func(test)
		expected expected
	}

	user := s.factory.NewUser()

	tests := []test{
		{
			name: "ok_valid_access_token",
			opts: []repo.ListExercisesOpt{
				repo.ListExercisesWithUserID(user.ID),
				repo.ListExercisesWithLimit(2),
			},
			init: func(_ test) {
				s.factory.NewExercise(factory.ExerciseUserID(user.ID))
				s.factory.NewExercise(factory.ExerciseUserID(user.ID))
				s.factory.NewExercise(factory.ExerciseUserID(user.ID))
			},
			expected: expected{
				err:           nil,
				exercises:     2,
				nextPageToken: true,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			exercises, err := s.repo.ListExercises(context.Background(), t.opts...)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)

				return
			}

			s.Require().NoError(err)
			s.Require().Len(exercises, t.expected.exercises)
		})
	}
}

func (s *repoSuite) TestCountSets() {
	ctx := context.Background()
	user := s.factory.NewUser()
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	other := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	count, err := s.repo.CountSets(ctx, repo.CountSetsWithExerciseID(exercise.ID))
	s.Require().NoError(err)
	s.Require().Zero(count)

	s.factory.NewSetSlice(2, factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID))
	s.factory.NewSet(factory.SetUserID(user.ID), factory.SetExerciseID(other.ID))

	count, err = s.repo.CountSets(ctx, repo.CountSetsWithExerciseID(exercise.ID))
	s.Require().NoError(err)
	s.Require().Equal(int64(2), count)
}

func (s *repoSuite) TestUpdateRoutine() {
	type expected struct {
		err error
	}

	type test struct {
		name      string
		routineID uuid.UUID
		opts      []repo.UpdateRoutineOpt
		init      func(test)
		expected  expected
	}

	tests := []test{
		{
			name:      "ok_update_routine_name",
			routineID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateRoutineOpt{
				repo.UpdateRoutineName("new"),
			},
			init: func(t test) {
				s.factory.NewRoutine(
					factory.RoutineID(t.routineID),
					factory.RoutineName("old"),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:      "err_duplicate_column_update",
			routineID: uuid.Must(uuid.NewV4()),
			opts: []repo.UpdateRoutineOpt{
				repo.UpdateRoutineName("new"),
				repo.UpdateRoutineName("newer"),
			},
			init: func(_ test) {},
			expected: expected{
				err: repo.ErrUpdateDuplicateColumn,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			err := s.repo.UpdateRoutine(context.Background(), t.routineID, t.opts...)
			s.Require().ErrorIs(err, t.expected.err)
		})
	}
}

// TestListsBreakTiesOnID guards against a paged list changing order between two loads of the same
// rows. Ordering by created_at alone is not a total order — the seed writes one timestamp across
// every row of an account — and Postgres is then free to return tied rows in whatever order they
// physically sit in, which any write to the table changes. Whichever routine comes back first is the
// one the app offers as up next, so a tie moves the home, workout and training screens at once.
func (s *repoSuite) TestListsBreakTiesOnID() {
	ctx := context.Background()
	userID := s.factory.NewUser().ID

	// Written in ascending id order, so a list that fell back to the order the rows were written in
	// would hand them back the other way round from one ordered by id descending.
	ids := make([]uuid.UUID, 0, 5)
	for range 5 {
		ids = append(ids, uuid.Must(uuid.NewV4()))
	}
	slices.SortFunc(ids, func(a, b uuid.UUID) int { return bytes.Compare(a[:], b[:]) })

	createdAt := time.Now()
	for _, id := range ids {
		s.factory.NewRoutine(factory.RoutineID(id), factory.RoutineUserID(userID))
		s.factory.NewWorkout(
			factory.WorkoutID(id),
			factory.WorkoutUserID(userID),
			factory.WorkoutCreatedAt(createdAt),
		)
	}
	_, err := s.container.DB.ExecContext(ctx,
		`UPDATE public.routines SET created_at = $2 WHERE user_id = $1`, userID, createdAt)
	s.Require().NoError(err)

	newestFirst := slices.Clone(ids)
	slices.Reverse(newestFirst)

	routines, err := s.repo.ListRoutines(
		ctx,
		repo.ListRoutinesWithUserID(userID),
		repo.ListRoutinesWithPageToken(nil),
	)
	s.Require().NoError(err)
	routineIDs := make([]uuid.UUID, 0, len(routines))
	for _, routine := range routines {
		routineIDs = append(routineIDs, routine.ID)
	}
	s.Require().Equal(newestFirst, routineIDs)

	workouts, err := s.repo.ListWorkouts(
		ctx,
		repo.ListWorkoutsWithUserIDs(userID),
		repo.ListWorkoutsWithPageToken(nil),
	)
	s.Require().NoError(err)
	workoutIDs := make([]uuid.UUID, 0, len(workouts))
	for _, workout := range workouts {
		workoutIDs = append(workoutIDs, workout.ID)
	}
	s.Require().Equal(newestFirst, workoutIDs)
}

// TestGetRoutineExercisesAreStablyOrdered guards against the routine detail page showing a
// different exercise order on every load. Without an ORDER BY, Postgres is free to return the rows
// in heap order, and any write to an exercise row relocates it within the heap. The no-op update
// below changes no data at all, yet is enough to reshuffle an unordered result; the position
// column recorded on the relationship table must keep the order fixed.
func (s *repoSuite) TestGetRoutineExercisesAreStablyOrdered() {
	ctx := context.Background()
	userID := s.factory.NewUser().ID
	routineID := uuid.Must(uuid.NewV4())

	routine := s.factory.NewRoutine(
		factory.RoutineID(routineID),
		factory.RoutineUserID(userID),
	)

	// Duplicate titles are what the seeded data looks like, and they make ties likely.
	exercises := models.ExerciseSlice{
		s.factory.NewExercise(factory.ExerciseUserID(userID), factory.ExerciseTitle("Squats")),
		s.factory.NewExercise(factory.ExerciseUserID(userID), factory.ExerciseTitle("Deadlifts")),
		s.factory.NewExercise(factory.ExerciseUserID(userID), factory.ExerciseTitle("Squats")),
		s.factory.NewExercise(factory.ExerciseUserID(userID), factory.ExerciseTitle("Plank")),
		s.factory.NewExercise(factory.ExerciseUserID(userID), factory.ExerciseTitle("Deadlifts")),
	}
	s.factory.AddRoutineExercise(routine, exercises...)

	loadExerciseIDs := func() []string {
		fetched, err := s.repo.GetRoutine(
			ctx,
			repo.GetRoutineWithID(routineID),
			repo.GetRoutineWithUserID(userID),
			repo.GetRoutineWithExercises(),
		)
		s.Require().NoError(err)

		exerciseIDs := make([]string, 0, len(fetched.Exercises))
		for _, exercise := range fetched.Exercises {
			exerciseIDs = append(exerciseIDs, exercise.ID.String())
		}
		return exerciseIDs
	}

	first := loadExerciseIDs()
	s.Require().Len(first, len(exercises))

	// Rewriting a single row in place is what moves it relative to the others; touching every row
	// would leave their relative order intact and prove nothing.
	_, err := s.container.DB.ExecContext(ctx,
		`UPDATE public.exercises SET title = title WHERE id = $1`, exercises[1].ID.String())
	s.Require().NoError(err)

	s.Require().Equal(first, loadExerciseIDs(), "routine exercise order changed between loads")

	// Positions follow the order the exercises were added in.
	expected := make([]string, 0, len(exercises))
	for _, exercise := range exercises {
		expected = append(expected, exercise.ID.String())
	}
	s.Require().Equal(expected, first)
}

// routineExerciseIDs loads the routine's exercises in their recorded order.
func (s *repoSuite) routineExerciseIDs(routineID uuid.UUID) []uuid.UUID {
	fetched, err := s.repo.GetRoutine(
		context.Background(),
		repo.GetRoutineWithID(routineID),
		repo.GetRoutineWithExercises(),
	)
	s.Require().NoError(err)

	exerciseIDs := make([]uuid.UUID, 0, len(fetched.Exercises))
	for _, exercise := range fetched.Exercises {
		exerciseIDs = append(exerciseIDs, exercise.ID)
	}
	return exerciseIDs
}

// loadExercise reads a seeded exercise back as the entity a repo method takes.
func (s *repoSuite) loadExercise(id uuid.UUID) *training.Exercise {
	exercise, err := s.repo.GetExercise(context.Background(), repo.GetExerciseWithID(id))
	s.Require().NoError(err)
	return exercise
}

// loadExercises reads seeded exercises back as entities, in the rows' order.
func (s *repoSuite) loadExercises(rows models.ExerciseSlice) []*training.Exercise {
	ids := make([]uuid.UUID, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}

	exercises, err := s.repo.ListExercises(context.Background(), repo.ListExercisesWithIDs(ids))
	s.Require().NoError(err)
	exercises = training.OrderExercisesByIDs(exercises, ids)
	s.Require().Len(exercises, len(ids))
	return exercises
}

// loadRoutine reads a seeded routine back as the entity a repo method takes.
func (s *repoSuite) loadRoutine(id uuid.UUID) *training.Routine {
	routine, err := s.repo.GetRoutine(context.Background(), repo.GetRoutineWithID(id))
	s.Require().NoError(err)
	return routine
}

func (s *repoSuite) TestCreateRoutineKeepsRequestedExerciseOrder() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))

	// Deliberately not the creation order of the exercises.
	exerciseIDs := []uuid.UUID{
		exercises[2].ID,
		exercises[0].ID,
		exercises[1].ID,
	}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Legs",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)
	s.Require().Equal(exerciseIDs, s.routineExerciseIDs(routine.ID))
}

// routineExercises names a group's exercises, none of them overriding the rest
// the exercise library already says they take.
func routineExercises(ids ...uuid.UUID) []training.RoutineExerciseDraft {
	drafts := make([]training.RoutineExerciseDraft, 0, len(ids))
	for _, id := range ids {
		drafts = append(drafts, training.RoutineExerciseDraft{ExerciseID: id})
	}

	return drafts
}

func (s *repoSuite) routineGroupExerciseIDs(routineID uuid.UUID) [][]uuid.UUID {
	groups, err := s.repo.ListRoutineGroups(context.Background(), routineID)
	s.Require().NoError(err)

	grouped := make([][]uuid.UUID, 0, len(groups))
	for _, group := range groups {
		exerciseIDs := make([]uuid.UUID, 0, len(group.Exercises))
		for _, exercise := range group.Exercises {
			exerciseIDs = append(exerciseIDs, exercise.Exercise.ID)
		}
		grouped = append(grouped, exerciseIDs)
	}
	return grouped
}

func (s *repoSuite) TestCreateRoutineWithoutGroupsHoldsOneStraightGroup() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := []uuid.UUID{exercises[0].ID, exercises[1].ID}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Legs",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID)
	s.Require().NoError(err)
	s.Require().Len(groups, 1)
	s.Require().Equal(training.RoutineGroupModeStraight, groups[0].Mode)
	s.Require().Equal([][]uuid.UUID{exerciseIDs}, s.routineGroupExerciseIDs(routine.ID))
}

func (s *repoSuite) TestCreateRoutineWithGroups() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	warmUpID := exercises[0].ID
	circuitIDs := []uuid.UUID{exercises[1].ID, exercises[2].ID}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Full body",
		ExerciseIDs: append([]uuid.UUID{warmUpID}, circuitIDs...),
		Groups: []training.RoutineGroupDraft{
			{
				Mode:      training.RoutineGroupModeStraight,
				Exercises: routineExercises(warmUpID),
			},
			{
				Mode:                        training.RoutineGroupModeCircuit,
				RestBetweenExercisesSeconds: 15,
				RestBetweenRoundsSeconds:    90,
				Rounds:                      3,
				Exercises:                   routineExercises(circuitIDs...),
			},
		},
	})
	s.Require().NoError(err)

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID)
	s.Require().NoError(err)
	s.Require().Len(groups, 2)

	s.Require().Equal(training.RoutineGroupModeStraight, groups[0].Mode)
	s.Require().Equal(training.RoutineGroupModeCircuit, groups[1].Mode)
	s.Require().Equal(int32(15), groups[1].RestBetweenExercisesSeconds)
	s.Require().Equal(int32(90), groups[1].RestBetweenRoundsSeconds)
	s.Require().Equal(int32(3), groups[1].Rounds)

	s.Require().Equal([][]uuid.UUID{{warmUpID}, circuitIDs}, s.routineGroupExerciseIDs(routine.ID))
	// The flat exercise order is the groups read end to end.
	s.Require().Equal(append([]uuid.UUID{warmUpID}, circuitIDs...), s.routineExerciseIDs(routine.ID))
}

func (s *repoSuite) TestSetRoutineGroupsReplacesTheWholeStructure() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := []uuid.UUID{exercises[0].ID, exercises[1].ID, exercises[2].ID}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Full body",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.SetRoutineGroups(context.Background(), routine, []training.RoutineGroupDraft{
		{
			Mode:      training.RoutineGroupModeStraight,
			Exercises: routineExercises(exerciseIDs[2]),
		},
		{
			Mode:                     training.RoutineGroupModeCircuit,
			RestBetweenRoundsSeconds: 60,
			Exercises:                routineExercises(exerciseIDs[0], exerciseIDs[1]),
		},
	}, s.loadExercises(exercises)))

	s.Require().Equal(
		[][]uuid.UUID{{exerciseIDs[2]}, {exerciseIDs[0], exerciseIDs[1]}},
		s.routineGroupExerciseIDs(routine.ID),
	)
	s.Require().Equal(
		[]uuid.UUID{exerciseIDs[2], exerciseIDs[0], exerciseIDs[1]},
		s.routineExerciseIDs(routine.ID),
	)
}

// The whole point of the per-occurrence rest: the routine's own answer survives
// a save and a reload, and a save that says nothing gets the rest a new
// occurrence starts at rather than no rest at all.
func (s *repoSuite) TestSetRoutineGroupsKeepsThePerExerciseRest() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := []uuid.UUID{exercises[0].ID, exercises[1].ID, exercises[2].ID}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Heavy day",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.SetRoutineGroups(context.Background(), routine, []training.RoutineGroupDraft{
		{
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.RoutineExerciseDraft{
				{ExerciseID: exerciseIDs[0], RestSeconds: new(int32(180))},
				{ExerciseID: exerciseIDs[1]},
				{ExerciseID: exerciseIDs[2], RestSeconds: new(int32(0))},
			},
		},
	}, s.loadExercises(exercises)))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID)
	s.Require().NoError(err)
	s.Require().Len(groups, 1)
	s.Require().Len(groups[0].Exercises, 3)

	s.Require().Equal(int32(180), groups[0].Exercises[0].RestSeconds)
	// Nothing said, so the row carries what a new occurrence starts at.
	s.Require().Equal(int32(training.DefaultRestSeconds), groups[0].Exercises[1].RestSeconds)
	// Zero is an answer of its own, and must not read back as "say nothing".
	s.Require().Equal(int32(0), groups[0].Exercises[2].RestSeconds)
}

// An exercise measured against the clock is one continuous effort, so a new
// occurrence of it starts with no timer — which is how a plank ends up resting
// nothing wherever a routine picks it up.
func (s *repoSuite) TestSetRoutineGroupsRestsTimeMeasuredExercisesForNothing() {
	user := s.factory.NewUser()
	lift := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	plank := s.factory.NewExercise(
		factory.ExerciseUserID(user.ID),
		factory.ExerciseMetrics(training.MetricTime.String()),
	)
	exercises := models.ExerciseSlice{lift, plank}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Core day",
		ExerciseIDs: []uuid.UUID{lift.ID, plank.ID},
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.SetRoutineGroups(context.Background(), routine, []training.RoutineGroupDraft{
		{
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.RoutineExerciseDraft{
				{ExerciseID: lift.ID},
				{ExerciseID: plank.ID},
			},
		},
	}, s.loadExercises(exercises)))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID)
	s.Require().NoError(err)
	s.Require().Len(groups[0].Exercises, 2)
	s.Require().Equal(int32(training.DefaultRestSeconds), groups[0].Exercises[0].RestSeconds)
	s.Require().Equal(int32(0), groups[0].Exercises[1].RestSeconds)
}

// Added from the exercise library rather than the routine builder, so nothing
// states a rest and the occurrence starts where a new one does.
func (s *repoSuite) TestAddExerciseToRoutineRestsByDefault() {
	user := s.factory.NewUser()
	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID: user.ID,
		Name:   "Core day",
	})
	s.Require().NoError(err)

	lift := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	plank := s.factory.NewExercise(
		factory.ExerciseUserID(user.ID),
		factory.ExerciseMetrics(training.MetricTime.String()),
	)
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), s.loadExercise(lift.ID), routine))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), s.loadExercise(plank.ID), routine))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID)
	s.Require().NoError(err)
	s.Require().Len(groups[0].Exercises, 2)
	s.Require().Equal(int32(training.DefaultRestSeconds), groups[0].Exercises[0].RestSeconds)
	s.Require().Equal(int32(0), groups[0].Exercises[1].RestSeconds)
}

// An exercise added to a routine that is already grouped joins the last group,
// which is where the flat order puts it too.
func (s *repoSuite) TestAddExerciseToRoutineJoinsTheLastGroup() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID,
		Name:        "Full body",
		ExerciseIDs: []uuid.UUID{exercises[0].ID, exercises[1].ID},
		Groups: []training.RoutineGroupDraft{
			{Mode: training.RoutineGroupModeStraight, Exercises: routineExercises(exercises[0].ID)},
			{Mode: training.RoutineGroupModeCircuit, Exercises: routineExercises(exercises[1].ID)},
		},
	})
	s.Require().NoError(err)

	added := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), s.loadExercise(added.ID), routine))

	s.Require().Equal(
		[][]uuid.UUID{{exercises[0].ID}, {exercises[1].ID, added.ID}},
		s.routineGroupExerciseIDs(routine.ID),
	)
}

func (s *repoSuite) TestAddExerciseToRoutinePlacesLast() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	s.factory.AddRoutineExercise(routine, exercises...)

	added := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), s.loadExercise(added.ID), s.loadRoutine(routine.ID)))

	s.Require().Equal(
		[]uuid.UUID{exercises[0].ID, exercises[1].ID, added.ID},
		s.routineExerciseIDs(routine.ID),
	)

	// An empty routine gets position one rather than an error from the missing maximum.
	emptyRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), s.loadExercise(added.ID), s.loadRoutine(emptyRoutine.ID)))
	s.Require().Equal([]uuid.UUID{added.ID}, s.routineExerciseIDs(emptyRoutine.ID))
}

func (s *repoSuite) TestUpdateRoutineExerciseOrder() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	s.factory.AddRoutineExercise(routine, exercises...)

	newOrder := []uuid.UUID{
		exercises[1].ID,
		exercises[2].ID,
		exercises[0].ID,
	}
	s.Require().NoError(s.repo.UpdateRoutineExerciseOrder(context.Background(), routine.ID, newOrder))

	s.Require().Equal(newOrder, s.routineExerciseIDs(routine.ID))
}

func (s *repoSuite) TestGetPreviousWorkoutSets() {
	type expected struct {
		err  error
		sets models.SetSlice
	}

	type test struct {
		name        string
		exerciseIDs []uuid.UUID
		init        func(test)
		expected    expected
	}

	exerciseIDs := []uuid.UUID{factory.UUID(0), factory.UUID(1)}
	for _, exerciseID := range exerciseIDs {
		s.factory.NewExercise(factory.ExerciseID(exerciseID))
	}

	workoutIDs := []uuid.UUID{factory.UUID(0), factory.UUID(1)}
	for _, workoutID := range workoutIDs {
		s.factory.NewWorkout(factory.WorkoutID(workoutID))
	}

	tests := []test{
		{
			name:        "ok",
			exerciseIDs: exerciseIDs,
			init: func(t test) {
				s.factory.NewSet(factory.SetCreatedAt(s.factory.Now().Add(-time.Minute)))
				s.factory.NewSet(factory.SetCreatedAt(s.factory.Now().Add(-time.Minute)))

				for _, exerciseID := range t.exerciseIDs {
					s.factory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(s.factory.Now().Add(-time.Second)),
					)
					s.factory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(s.factory.Now().Add(-time.Second)),
					)
				}

				for _, set := range t.expected.sets {
					s.factory.NewSet(
						factory.SetWorkoutID(set.WorkoutID),
						factory.SetExerciseID(set.ExerciseID),
						factory.SetReps(int(set.Reps)),
						factory.SetWeight(set.Weight),
						factory.SetCreatedAt(set.CreatedAt),
					)
				}
			},
			expected: expected{
				err: nil,
				sets: models.SetSlice{
					{
						WorkoutID:  workoutIDs[0],
						ExerciseID: exerciseIDs[0],
						Reps:       1,
						Weight:     1,
						CreatedAt:  s.factory.Now(),
					},
					{
						WorkoutID:  workoutIDs[0],
						ExerciseID: exerciseIDs[0],
						Reps:       2,
						Weight:     2,
						CreatedAt:  s.factory.Now().Add(time.Second),
					},
					{
						WorkoutID:  workoutIDs[1],
						ExerciseID: exerciseIDs[1],
						Reps:       3,
						Weight:     3,
						CreatedAt:  s.factory.Now().Add(2 * time.Second),
					},
					{
						WorkoutID:  workoutIDs[1],
						ExerciseID: exerciseIDs[1],
						Reps:       4,
						Weight:     4,
						CreatedAt:  s.factory.Now().Add(3 * time.Second),
					},
				},
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			sets, err := s.repo.GetPreviousWorkoutSets(context.Background(), t.exerciseIDs)
			if t.expected.err != nil {
				s.Require().Nil(sets)
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(sets)
			s.Require().Len(sets, len(t.expected.sets))
			for i, set := range sets {
				s.Require().Equal(t.expected.sets[i].WorkoutID, set.WorkoutID)
				s.Require().Equal(t.expected.sets[i].ExerciseID, set.ExerciseID)
				s.Require().Equal(t.expected.sets[i].Reps, set.Reps)
				s.Require().InEpsilon(t.expected.sets[i].Weight, set.Weight, 0)
			}
		})
	}
}

func (s *repoSuite) TestDeleteWorkout() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		opts     []repo.DeleteWorkoutOpt
		init     func(test) *models.Workout
		expected expected
	}

	userID := uuid.Must(uuid.NewV4())
	workoutID := uuid.Must(uuid.NewV4())

	tests := []test{
		{
			name: "ok_with_workout_id",
			opts: []repo.DeleteWorkoutOpt{
				repo.DeleteWorkoutWithID(workoutID),
			},
			init: func(_ test) *models.Workout {
				workout := s.factory.NewWorkout(factory.WorkoutID(workoutID))
				s.factory.NewSet(factory.SetWorkoutID(workoutID))
				s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workoutID))
				s.factory.NewNotification(factory.NotificationPayload(notification.Payload{
					WorkoutID: workoutID,
				}))

				return workout
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "ok_with_user_id",
			opts: []repo.DeleteWorkoutOpt{
				repo.DeleteWorkoutWithUserID(userID),
			},
			init: func(_ test) *models.Workout {
				user := s.factory.NewUser(factory.UserID(userID))
				workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
				s.factory.NewSet(factory.SetWorkoutID(workout.ID))
				s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID))
				s.factory.NewNotification(factory.NotificationPayload(notification.Payload{
					WorkoutID: workout.ID,
				}))

				return workout
			},
			expected: expected{
				err: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			workout := t.init(t)
			err := s.repo.DeleteWorkout(context.Background(), t.opts...)
			s.Require().ErrorIs(err, t.expected.err)

			exists, err := models.Workouts.Query(models.SelectWhere.Workouts.ID.EQ(workout.ID)).
				Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = models.Sets.Query(models.SelectWhere.Sets.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = models.WorkoutComments.Query(models.SelectWhere.WorkoutComments.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = models.Notifications.Query(sm.Where(psql.Raw("payload ->> 'workoutId' = ?", workout.ID))).
				Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)
		})
	}
}

func (s *repoSuite) TestDeleteUser() {
	ctx := context.Background()
	db := bob.NewDB(s.container.DB)

	auth := s.factory.NewAuth()
	user := s.factory.NewUser(factory.UserAuthID(auth.ID))
	other := s.factory.NewUser()

	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	s.factory.AddRoutineExercise(routine, exercise)
	workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
	set := s.factory.NewSet(factory.SetUserID(user.ID), factory.SetWorkoutID(workout.ID), factory.SetExerciseID(exercise.ID))

	// Someone else's comment on the account's workout goes with the workout.
	comment := s.factory.NewWorkoutComment(
		factory.WorkoutCommentUserID(other.ID),
		factory.WorkoutCommentWorkoutID(workout.ID),
	)

	plan, err := s.repo.CreatePlan(ctx, repo.CreatePlanParams{
		UserID:     user.ID,
		Name:       "Plan",
		RoutineIDs: []uuid.UUID{routine.ID},
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: user.ID,
		FolloweeID: other.ID,
	}))

	own := s.factory.NewNotification(factory.NotificationUserID(user.ID))
	// The follow notification sitting in someone else's list names the leaving
	// account as its actor, and would otherwise keep their badge lit forever.
	aboutUser := s.factory.NewNotification(
		factory.NotificationUserID(other.ID),
		factory.NotificationPayload(notification.Payload{ActorID: user.ID}),
	)
	unrelated := s.factory.NewNotification(factory.NotificationUserID(other.ID))

	s.Require().NoError(s.repo.DeleteUser(ctx, user.ID))

	gone := []struct {
		name   string
		exists func() (bool, error)
	}{
		{"auth", func() (bool, error) {
			return models.Auths.Query(models.SelectWhere.Auths.ID.EQ(auth.ID)).Exists(ctx, db)
		}},
		{"user", func() (bool, error) {
			return models.Users.Query(models.SelectWhere.Users.ID.EQ(user.ID)).Exists(ctx, db)
		}},
		{"routine", func() (bool, error) {
			return models.Routines.Query(models.SelectWhere.Routines.ID.EQ(routine.ID)).Exists(ctx, db)
		}},
		{"exercise", func() (bool, error) {
			return models.Exercises.Query(models.SelectWhere.Exercises.ID.EQ(exercise.ID)).Exists(ctx, db)
		}},
		{"workout", func() (bool, error) {
			return models.Workouts.Query(models.SelectWhere.Workouts.ID.EQ(workout.ID)).Exists(ctx, db)
		}},
		{"set", func() (bool, error) {
			return models.Sets.Query(models.SelectWhere.Sets.ID.EQ(set.ID)).Exists(ctx, db)
		}},
		{"comment", func() (bool, error) {
			return models.WorkoutComments.Query(models.SelectWhere.WorkoutComments.ID.EQ(comment.ID)).Exists(ctx, db)
		}},
		{"own notification", func() (bool, error) {
			return models.Notifications.Query(models.SelectWhere.Notifications.ID.EQ(own.ID)).Exists(ctx, db)
		}},
		{"notification about the user", func() (bool, error) {
			return models.Notifications.Query(models.SelectWhere.Notifications.ID.EQ(aboutUser.ID)).Exists(ctx, db)
		}},
		{"follow", func() (bool, error) {
			return models.Followers.Query(models.SelectWhere.Followers.FollowerID.EQ(user.ID)).Exists(ctx, db)
		}},
	}

	for _, g := range gone {
		exists, errExists := g.exists()
		s.Require().NoError(errExists, g.name)
		s.Require().False(exists, g.name)
	}

	exists, err := models.Notifications.Query(models.SelectWhere.Notifications.ID.EQ(unrelated.ID)).Exists(ctx, db)
	s.Require().NoError(err)
	s.Require().True(exists)

	exists, err = models.Users.Query(models.SelectWhere.Users.ID.EQ(other.ID)).Exists(ctx, db)
	s.Require().NoError(err)
	s.Require().True(exists)

	_, err = s.repo.GetPlan(ctx, plan.ID, user.ID)
	s.Require().ErrorIs(err, sql.ErrNoRows)
}

func (s *repoSuite) TestDeleteUserNotFound() {
	err := s.repo.DeleteUser(context.Background(), uuid.Must(uuid.NewV4()))
	s.Require().ErrorIs(err, sql.ErrNoRows)
}

func (s *repoSuite) TestUpdateWorkoutSets() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		params   repo.UpdateWorkoutSetsParams
		init     func(test)
		expected expected
	}

	tests := []test{
		{
			name: "ok",
			params: repo.UpdateWorkoutSetsParams{
				WorkoutID: uuid.Must(uuid.NewV4()),
				ExerciseSets: []repo.ExerciseSet{
					{
						ExerciseID: uuid.Must(uuid.NewV4()),
						Sets: []repo.Set{
							{
								Reps:   1,
								Weight: 2,
							},
						},
					},
					{
						ExerciseID: uuid.Must(uuid.NewV4()),
						Sets: []repo.Set{
							{
								Reps:   3,
								Weight: 4,
							},
						},
					},
				},
			},
			init: func(t test) {
				s.factory.NewWorkout(factory.WorkoutID(t.params.WorkoutID))
				s.factory.NewSet(factory.SetWorkoutID(t.params.WorkoutID))
				for _, exerciseSet := range t.params.ExerciseSets {
					s.factory.NewExercise(factory.ExerciseID(exerciseSet.ExerciseID))
				}
			},
			expected: expected{
				err: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)
			err := s.repo.UpdateWorkoutSets(context.Background(), t.params)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			workout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), t.params.WorkoutID)
			s.Require().NoError(err)

			sets, err := workout.Sets(
				sm.OrderBy(models.Sets.Columns.CreatedAt),
			).All(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)

			for i, set := range sets {
				s.Require().Equal(workout.CreatedAt.Add(time.Duration(i*2)*time.Minute), set.CreatedAt)
			}

			var setCount int
			mapExpectedExerciseSets := make(map[uuid.UUID][]repo.Set)
			for _, exerciseSet := range t.params.ExerciseSets {
				setCount += len(exerciseSet.Sets)
				mapExpectedExerciseSets[exerciseSet.ExerciseID] = exerciseSet.Sets
			}

			mapReceivedExerciseSets := make(map[uuid.UUID]models.SetSlice)
			for _, set := range sets {
				mapReceivedExerciseSets[set.ExerciseID] = append(mapReceivedExerciseSets[set.ExerciseID], set)
			}

			s.Require().Len(sets, setCount)
			s.Require().Len(mapReceivedExerciseSets, len(mapExpectedExerciseSets))

			for exerciseID, receivedSets := range mapReceivedExerciseSets {
				expectedSets, ok := mapExpectedExerciseSets[exerciseID]
				s.Require().True(ok)

				for i, receivedSet := range receivedSets {
					s.Require().Equal(int32(expectedSets[i].Reps), receivedSet.Reps)
					s.Require().InEpsilon(expectedSets[i].Weight, receivedSet.Weight, 0)
				}
			}
		})
	}
}

func (s *repoSuite) TestPublishEvent() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		topic    events.Topic
		payload  []byte
		expected expected
	}

	tests := []test{
		{
			name:    "ok_publish_event",
			topic:   events.TopicWorkoutCommentPosted,
			payload: []byte("{}"),
			expected: expected{
				err: nil,
			},
		},
		{
			name:    "err_invalid_topic",
			topic:   events.Topic("not_found"),
			payload: nil,
			expected: expected{
				err: repo.ErrInvalidTopic,
			},
		},
		{
			name:    "err_empty_payload",
			topic:   events.TopicWorkoutCommentPosted,
			payload: nil,
			expected: expected{
				err: repo.ErrEmptyPayload,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			err := s.repo.PublishEvent(context.Background(), t.topic, t.payload)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)

			exists, err := models.Events.Query(
				models.SelectWhere.Events.Topic.EQ(t.topic),
				models.SelectWhere.Events.Payload.EQ(bobtypes.NewJSON[json.RawMessage](t.payload)),
			).Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().True(exists)
		})
	}
}

// The same key sent twice is one save, and the second attempt is told so
// rather than stored; a save sent without a key is never taken for a repeat.
func (s *repoSuite) TestCreateWorkoutRejectsARepeatedIdempotencyKey() {
	user := s.factory.NewUser()
	press := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	params := repo.CreateWorkoutParams{
		Name:       "Push",
		UserID:     user.ID,
		StartedAt:  time.Now(),
		FinishedAt: time.Now().Add(time.Hour),
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: press.ID, Sets: []repo.Set{{Reps: 8, Weight: 60}}},
		},
		IdempotencyKey: uuid.Must(uuid.NewV4()),
	}

	first, err := s.repo.CreateWorkout(context.Background(), params)
	s.Require().NoError(err)
	_, err = s.repo.CreateWorkout(context.Background(), params)
	s.Require().ErrorIs(err, training.ErrWorkoutAlreadySaved)

	saved, err := s.repo.GetWorkout(
		context.Background(),
		repo.GetWorkoutWithUserID(user.ID),
		repo.GetWorkoutWithIdempotencyKey(params.IdempotencyKey),
	)
	s.Require().NoError(err)
	s.Require().Equal(first.ID, saved.ID)

	// A save that names no attempt is stored as none and never a repeat.
	params.IdempotencyKey = uuid.Nil
	_, err = s.repo.CreateWorkout(context.Background(), params)
	s.Require().NoError(err)
	_, err = s.repo.CreateWorkout(context.Background(), params)
	s.Require().NoError(err)
}

// An edit rewrites every set row, so the block each of them was logged in has
// to be carried across: changing what was lifted must not change how the
// session was structured.
func (s *repoSuite) TestUpdateWorkoutSetsKeepsTheBlocks() {
	user := s.factory.NewUser()
	press := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	squat := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	workout, err := s.repo.CreateWorkout(context.Background(), repo.CreateWorkoutParams{
		Name:       "Circuit",
		UserID:     user.ID,
		StartedAt:  time.Now(),
		FinishedAt: time.Now().Add(time.Hour),
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: press.ID, Sets: []repo.Set{{Reps: 8, Weight: 60}, {Reps: 8, Weight: 60}}},
			{ExerciseID: squat.ID, Sets: []repo.Set{{Reps: 5, Weight: 90}}},
		},
		Groups: []training.WorkoutGroup{
			{
				Mode:   training.RoutineGroupModeCircuit,
				Rounds: 2,
				Exercises: []training.WorkoutGroupExerciseSets{
					{ExerciseID: press.ID, SetPositions: []int{0, 1}},
					{ExerciseID: squat.ID, SetPositions: []int{0}},
				},
			},
		},
	})
	s.Require().NoError(err)

	// The same session, one press set corrected and one squat set added.
	s.Require().NoError(s.repo.UpdateWorkoutSets(context.Background(), repo.UpdateWorkoutSetsParams{
		WorkoutID: workout.ID,
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: press.ID, Sets: []repo.Set{{Reps: 8, Weight: 65}, {Reps: 8, Weight: 60}}},
			{ExerciseID: squat.ID, Sets: []repo.Set{{Reps: 5, Weight: 90}, {Reps: 5, Weight: 95}}},
		},
	}))

	groups, err := s.repo.ListWorkoutGroups(context.Background(), workout.ID)
	s.Require().NoError(err)
	s.Require().Len(groups[workout.ID], 1)

	updated, err := s.repo.GetWorkout(
		context.Background(),
		repo.GetWorkoutWithID(workout.ID),
		repo.GetWorkoutLoadSets(),
	)
	s.Require().NoError(err)
	s.Require().Len(updated.Sets, 4)

	grouped := 0
	for _, set := range updated.Sets {
		if set.OccurrenceID.IsNil() {
			continue
		}
		grouped++
	}
	// Three sets were in the block; the fourth was added by the edit and sits
	// outside every block the session held.
	s.Require().Equal(3, grouped)
}

func (s *repoSuite) TestUpdateWorkout() {
	type expected struct {
		err     error
		workout *models.Workout
		columns map[string]any
	}

	type test struct {
		name     string
		workout  *models.Workout
		opts     []repo.UpdateWorkoutOpt
		expected expected
	}

	tests := []test{
		{
			name:    "ok_update_name",
			workout: s.factory.NewWorkout(),
			opts: []repo.UpdateWorkoutOpt{
				repo.UpdateWorkoutName("New"),
			},
			expected: expected{
				err: nil,
				columns: map[string]any{
					models.Workouts.Columns.Name.Name(): "New",
				},
			},
		},
		{
			name:    "ok_update_note",
			workout: s.factory.NewWorkout(),
			opts: []repo.UpdateWorkoutOpt{
				repo.UpdateWorkoutNote("Note"),
			},
			expected: expected{
				err: nil,
				columns: map[string]any{
					models.Workouts.Columns.Note.Name(): "Note",
				},
			},
		},
		{
			name:    "ok_update_started_at",
			workout: s.factory.NewWorkout(),
			opts: []repo.UpdateWorkoutOpt{
				repo.UpdateWorkoutStartedAt(s.factory.Now().Add(-1 * time.Hour)),
			},
			expected: expected{
				err: nil,
				columns: map[string]any{
					models.Workouts.Columns.StartedAt.Name(): s.factory.Now().Add(-1 * time.Hour),
				},
			},
		},
		{
			name:    "ok_update_multiple_columns",
			workout: s.factory.NewWorkout(),
			opts: []repo.UpdateWorkoutOpt{
				repo.UpdateWorkoutName("Name"),
				repo.UpdateWorkoutNote("Note"),
			},
			expected: expected{
				err: nil,
				columns: map[string]any{
					models.Workouts.Columns.Name.Name(): "Name",
					models.Workouts.Columns.Note.Name(): "Note",
				},
			},
		},
		{
			name: "err_not_found",
			workout: &models.Workout{
				ID: uuid.Must(uuid.NewV4()),
			},
			opts: []repo.UpdateWorkoutOpt{
				repo.UpdateWorkoutName("Name"),
			},
			expected: expected{
				err: sql.ErrNoRows,
			},
		},
		{
			name:    "err_empty_opts",
			workout: s.factory.NewWorkout(),
			opts:    nil,
			expected: expected{
				err: repo.ErrUpdateNoColumns,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			err := s.repo.UpdateWorkout(context.Background(), t.workout.ID, t.opts...)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)

			workout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), t.workout.ID)
			s.Require().NoError(err)
			for column, value := range t.expected.columns {
				switch column {
				case models.Workouts.Columns.Name.Name():
					s.Require().Equal(value, workout.Name)
				case models.Workouts.Columns.Note.Name():
					s.Require().Equal(value, workout.Note.GetOrZero())
				case models.Workouts.Columns.StartedAt.Name():
					s.Require().True(value.(time.Time).Equal(workout.StartedAt))
				case models.Workouts.Columns.FinishedAt.Name():
					s.Require().True(value.(time.Time).Equal(workout.FinishedAt))
				}
			}
		})
	}
}

func (s *repoSuite) TestListFollowersAndFollowees() {
	ctx := context.Background()
	follower := s.factory.NewUser()
	user := s.factory.NewUser()
	followee := s.factory.NewUser()

	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: follower.ID,
		FolloweeID: user.ID,
	}))
	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: user.ID,
		FolloweeID: followee.ID,
	}))

	followers, err := s.repo.ListFollowers(ctx, user.ID)
	s.Require().NoError(err)
	s.Require().Len(followers, 1)
	s.Require().Equal(follower.ID, followers[0].ID)

	followees, err := s.repo.ListFollowees(ctx, user.ID)
	s.Require().NoError(err)
	s.Require().Len(followees, 1)
	s.Require().Equal(followee.ID, followees[0].ID)
}

// Every list that pages does the same two things with a token: no token orders
// the whole set newest first, and a token cuts it off at that instant. A token
// that is not a token is an error rather than a silent first page.
func (s *repoSuite) TestListPageTokens() {
	ctx := context.Background()
	user := s.factory.NewUser()
	now := time.Now().UTC()
	// Truncated to the precision the token itself carries, so the cursor
	// compares exactly rather than by a stray nanosecond.
	cutoff := now.Add(-time.Hour).Truncate(time.Microsecond)
	token, err := json.Marshal(repo.PageTokenCreatedAt(cutoff))
	s.Require().NoError(err)

	malformed := []byte("not a token")

	s.Run("exercises", func() {
		s.factory.NewExercise(factory.ExerciseUserID(user.ID), factory.ExerciseCreatedAt(now))
		older := s.factory.NewExercise(factory.ExerciseUserID(user.ID), factory.ExerciseCreatedAt(now.Add(-2*time.Hour)))

		listed, listErr := s.repo.ListExercises(
			ctx,
			repo.ListExercisesWithUserID(user.ID),
			repo.ListExercisesWithPageToken(token),
		)
		s.Require().NoError(listErr)
		s.Require().Len(listed, 1)
		s.Require().Equal(older.ID, listed[0].ID)

		_, listErr = s.repo.ListExercises(ctx, repo.ListExercisesWithPageToken(malformed))
		s.Require().Error(listErr)
	})

	s.Run("workouts", func() {
		s.factory.NewWorkout(factory.WorkoutUserID(user.ID), factory.WorkoutCreatedAt(now))
		older := s.factory.NewWorkout(factory.WorkoutUserID(user.ID), factory.WorkoutCreatedAt(now.Add(-2*time.Hour)))

		listed, listErr := s.repo.ListWorkouts(
			ctx,
			repo.ListWorkoutsWithUserIDs(user.ID),
			repo.ListWorkoutsWithPageToken(token),
		)
		s.Require().NoError(listErr)
		s.Require().Len(listed, 1)
		s.Require().Equal(older.ID, listed[0].ID)

		_, listErr = s.repo.ListWorkouts(ctx, repo.ListWorkoutsWithPageToken(malformed))
		s.Require().Error(listErr)
	})

	s.Run("notifications", func() {
		s.factory.NewNotification(factory.NotificationUserID(user.ID), factory.NotificationCreatedAt(now))
		older := s.factory.NewNotification(factory.NotificationUserID(user.ID), factory.NotificationCreatedAt(now.Add(-2*time.Hour)))

		listed, listErr := s.repo.ListNotifications(
			ctx,
			repo.ListNotificationsWithUserID(user.ID),
			repo.ListNotificationsWithPageToken(token),
		)
		s.Require().NoError(listErr)
		s.Require().Len(listed, 1)
		s.Require().Equal(older.ID, listed[0].ID)

		_, listErr = s.repo.ListNotifications(ctx, repo.ListNotificationsWithPageToken(malformed))
		s.Require().Error(listErr)
	})

	s.Run("sets", func() {
		exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
		s.factory.NewSet(factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID), factory.SetCreatedAt(now))
		older := s.factory.NewSet(factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID), factory.SetCreatedAt(now.Add(-2*time.Hour)))

		listed, listErr := s.repo.ListSets(
			ctx,
			repo.ListSetsWithExerciseID(exercise.ID),
			repo.ListSetsWithPageToken(token),
		)
		s.Require().NoError(listErr)
		s.Require().Len(listed, 1)
		s.Require().Equal(older.ID, listed[0].ID)

		_, listErr = s.repo.ListSets(ctx, repo.ListSetsWithPageToken(malformed))
		s.Require().Error(listErr)
	})
}

// A page whose last item cannot be turned into a cursor is an error, not a page
// without a next token: the client would otherwise stop at a partial list.
func (s *repoSuite) TestPaginateSliceReportsAnUnmarshalableCursor() {
	items := []*training.Workout{{}, {}}
	_, err := repo.PaginateSlice(items, 1, func(*training.Workout) (time.Time, uuid.UUID) {
		return time.Date(-1, time.January, 1, 0, 0, 0, 0, time.UTC), uuid.Nil
	})
	s.Require().Error(err)
}

// A page boundary can land inside a group of rows sharing created_at — every
// set of a workout does, since Postgres fixes NOW() per transaction — so the
// cursor names a row, not a timestamp. Walking pages must return every row
// exactly once whatever the tie.
func (s *repoSuite) TestListPageTokensSurviveCreatedAtTies() {
	ctx := context.Background()
	tie := time.Now().UTC().Truncate(time.Microsecond)

	const pageLimit = 2

	// walk pages the way the handlers do: limit+1, trim, follow the token.
	walk := func(list func(token []byte) ([]string, []byte)) []string {
		var seen []string
		var token []byte
		for range 5 {
			ids, next := list(token)
			seen = append(seen, ids...)
			if next == nil {
				return seen
			}
			token = next
		}
		s.T().Fatal("pagination never ended")
		return nil
	}

	s.Run("workouts", func() {
		user := s.factory.NewUser()
		want := make([]string, 0, 3)
		for range 3 {
			want = append(want, s.factory.NewWorkout(factory.WorkoutUserID(user.ID), factory.WorkoutCreatedAt(tie)).ID.String())
		}

		seen := walk(func(token []byte) ([]string, []byte) {
			listed, err := s.repo.ListWorkouts(
				ctx,
				repo.ListWorkoutsWithUserIDs(user.ID),
				repo.ListWorkoutsWithLimit(pageLimit+1),
				repo.ListWorkoutsWithPageToken(token),
			)
			s.Require().NoError(err)
			page, err := repo.PaginateSlice(listed, pageLimit, func(w *training.Workout) (time.Time, uuid.UUID) {
				return w.CreatedAt, w.ID
			})
			s.Require().NoError(err)
			ids := make([]string, 0, len(page.Items))
			for _, workout := range page.Items {
				ids = append(ids, workout.ID.String())
			}
			return ids, page.NextPageToken
		})

		s.Require().ElementsMatch(want, seen)
	})

	s.Run("sets", func() {
		user := s.factory.NewUser()
		exercise := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
		want := make([]string, 0, 3)
		for range 3 {
			want = append(want, s.factory.NewSet(
				factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID), factory.SetCreatedAt(tie),
			).ID.String())
		}

		seen := walk(func(token []byte) ([]string, []byte) {
			listed, err := s.repo.ListSets(
				ctx,
				repo.ListSetsWithExerciseID(exercise.ID),
				repo.ListSetsWithLimit(pageLimit+1),
				repo.ListSetsWithPageToken(token),
				repo.ListSetsOrderByCreatedAt(repo.DESC),
			)
			s.Require().NoError(err)
			page, err := repo.PaginateSlice(listed, pageLimit, func(set *training.Set) (time.Time, uuid.UUID) {
				return set.CreatedAt, set.ID
			})
			s.Require().NoError(err)
			ids := make([]string, 0, len(page.Items))
			for _, set := range page.Items {
				ids = append(ids, set.ID.String())
			}
			return ids, page.NextPageToken
		})

		s.Require().ElementsMatch(want, seen)
	})

	s.Run("exercises", func() {
		user := s.factory.NewUser()
		want := make([]string, 0, 3)
		for range 3 {
			want = append(want, s.factory.NewExercise(factory.ExerciseUserID(user.ID), factory.ExerciseCreatedAt(tie)).ID.String())
		}

		seen := walk(func(token []byte) ([]string, []byte) {
			listed, err := s.repo.ListExercises(
				ctx,
				repo.ListExercisesWithUserID(user.ID),
				repo.ListExercisesWithLimit(pageLimit+1),
				repo.ListExercisesWithPageToken(token),
			)
			s.Require().NoError(err)
			page, err := repo.PaginateSlice(listed, pageLimit, func(exercise *training.Exercise) (time.Time, uuid.UUID) {
				return exercise.CreatedAt, exercise.ID
			})
			s.Require().NoError(err)
			ids := make([]string, 0, len(page.Items))
			for _, exercise := range page.Items {
				ids = append(ids, exercise.ID.String())
			}
			return ids, page.NextPageToken
		})

		s.Require().ElementsMatch(want, seen)
	})

	s.Run("routines", func() {
		user := s.factory.NewUser()
		want := make([]string, 0, 3)
		for range 3 {
			want = append(want, s.factory.NewRoutine(factory.RoutineUserID(user.ID), factory.RoutineCreatedAt(tie)).ID.String())
		}

		seen := walk(func(token []byte) ([]string, []byte) {
			listed, err := s.repo.ListRoutines(
				ctx,
				repo.ListRoutinesWithUserID(user.ID),
				repo.ListRoutinesWithLimit(pageLimit+1),
				repo.ListRoutinesWithPageToken(token),
			)
			s.Require().NoError(err)
			page, err := repo.PaginateSlice(listed, pageLimit, func(routine *training.Routine) (time.Time, uuid.UUID) {
				return routine.CreatedAt, routine.ID
			})
			s.Require().NoError(err)
			ids := make([]string, 0, len(page.Items))
			for _, routine := range page.Items {
				ids = append(ids, routine.ID.String())
			}
			return ids, page.NextPageToken
		})

		s.Require().ElementsMatch(want, seen)
	})

	s.Run("notifications", func() {
		user := s.factory.NewUser()
		want := make([]string, 0, 3)
		for range 3 {
			want = append(want, s.factory.NewNotification(
				factory.NotificationUserID(user.ID), factory.NotificationCreatedAt(tie),
			).ID.String())
		}

		seen := walk(func(token []byte) ([]string, []byte) {
			listed, err := s.repo.ListNotifications(
				ctx,
				repo.ListNotificationsWithUserID(user.ID),
				repo.ListNotificationsWithLimit(pageLimit+1),
				repo.ListNotificationsWithPageToken(token),
			)
			s.Require().NoError(err)
			page, err := repo.PaginateSlice(listed, pageLimit, func(n *notification.Notification) (time.Time, uuid.UUID) {
				return n.CreatedAt, n.ID
			})
			s.Require().NoError(err)
			ids := make([]string, 0, len(page.Items))
			for _, n := range page.Items {
				ids = append(ids, n.ID.String())
			}
			return ids, page.NextPageToken
		})

		s.Require().ElementsMatch(want, seen)
	})

	// A token minted before cursors carried an id names only a timestamp. It
	// keeps its strictly-older meaning: rows tied with it stay excluded.
	s.Run("legacy_timestamp_token_stays_strictly_older", func() {
		user := s.factory.NewUser()
		s.factory.NewWorkout(factory.WorkoutUserID(user.ID), factory.WorkoutCreatedAt(tie))
		older := s.factory.NewWorkout(factory.WorkoutUserID(user.ID), factory.WorkoutCreatedAt(tie.Add(-time.Hour)))

		token, err := json.Marshal(repo.PageTokenCreatedAt(tie))
		s.Require().NoError(err)

		listed, err := s.repo.ListWorkouts(
			ctx,
			repo.ListWorkoutsWithUserIDs(user.ID),
			repo.ListWorkoutsWithPageToken(token),
		)
		s.Require().NoError(err)
		s.Require().Len(listed, 1)
		s.Require().Equal(older.ID, listed[0].ID)
	})
}

// A routine may only hold exercises its owner still has, so the two ways that
// can be untrue are refused before anything is written.
func (s *repoSuite) TestCreateRoutineRefusesExercisesItMayNotHold() {
	ctx := context.Background()
	user := s.factory.NewUser()

	s.Run("err_another_athletes_exercise", func() {
		theirs := s.factory.NewExercise(factory.ExerciseUserID(s.factory.NewUser().ID))

		_, err := s.repo.CreateRoutine(ctx, repo.CreateRoutineParams{
			UserID:      user.ID,
			Name:        "Borrowed",
			ExerciseIDs: []uuid.UUID{theirs.ID},
		})
		s.Require().ErrorIs(err, repo.ErrRoutineExerciseBelongsToAnotherUser)
	})

	s.Run("err_deleted_exercise", func() {
		deleted := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
		s.Require().NoError(s.repo.SoftDeleteExercise(ctx, repo.SoftDeleteExerciseParams{
			UserID:     user.ID,
			ExerciseID: deleted.ID,
		}))

		_, err := s.repo.CreateRoutine(ctx, repo.CreateRoutineParams{
			UserID:      user.ID,
			Name:        "Retired",
			ExerciseIDs: []uuid.UUID{deleted.ID},
		})
		s.Require().ErrorIs(err, repo.ErrRoutineExerciseDeleted)
	})
}

// Deleting by no criterion at all would delete by the first row it found, so
// the call is refused rather than run.
func (s *repoSuite) TestDeleteWorkoutRequiresAnOption() {
	s.Require().Error(s.repo.DeleteWorkout(context.Background()))
}

// An empty ID set is not a filter that matches nothing: it is no filter, and
// the option says so by adding no condition at all.
func (s *repoSuite) TestListExercisesWithNoIDsDoesNotFilter() {
	ctx := context.Background()
	user := s.factory.NewUser()
	s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	listed, err := s.repo.ListExercises(
		ctx,
		repo.ListExercisesWithUserID(user.ID),
		repo.ListExercisesWithIDs(nil),
	)
	s.Require().NoError(err)
	s.Require().Len(listed, 1)
}

func (s *repoSuite) TestCountNotificationsCountsReadOnesToo() {
	ctx := context.Background()
	user := s.factory.NewUser()
	s.factory.NewNotification(factory.NotificationUserID(user.ID))
	s.factory.NewNotification(factory.NotificationUserID(user.ID), factory.NotificationRead())

	unread, err := s.repo.CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(user.ID),
		repo.CountNotificationsWithUnreadOnly(true),
	)
	s.Require().NoError(err)
	s.Require().Equal(int64(1), unread)

	all, err := s.repo.CountNotifications(
		ctx,
		repo.CountNotificationsWithUserID(user.ID),
		repo.CountNotificationsWithUnreadOnly(false),
	)
	s.Require().NoError(err)
	s.Require().Equal(int64(2), all)
}

// A payload that cannot be read is a notification nothing can be rendered
// from, so the list reports it rather than handing back a row with no subject.
func (s *repoSuite) TestListNotificationsRefusesAnUnreadablePayload() {
	ctx := context.Background()
	user := s.factory.NewUser()

	_, err := models.Notifications.Insert(&models.NotificationSetter{
		UserID:  omit.From(user.ID),
		Type:    omit.From(notification.TypeFollow),
		Payload: omit.From(bobtypes.NewJSON[json.RawMessage]([]byte(`{"actorId":"not-a-uuid"}`))),
	}).Exec(ctx, bob.NewDB(s.container.DB))
	s.Require().NoError(err)

	_, err = s.repo.ListNotifications(ctx, repo.ListNotificationsWithUserID(user.ID))
	s.Require().Error(err)
}

// Asking about no workouts is not an error and not a query: the caller gets an
// empty map back without the database being touched.
func (s *repoSuite) TestListWorkoutGroupsOfNothing() {
	groups, err := s.repo.ListWorkoutGroups(context.Background())
	s.Require().NoError(err)
	s.Require().Empty(groups)
}

// An exercise the save names but logs nothing for is dropped rather than
// written as an exercise with no sets, which nothing can render. Both the
// first save of a workout and every one after it have to agree on that.
func (s *repoSuite) TestWorkoutSavesDropAnExerciseWithNoSets() {
	ctx := context.Background()
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	logged := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	empty := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	workout, err := s.repo.CreateWorkout(ctx, repo.CreateWorkoutParams{
		Name:      "Session",
		UserID:    user.ID,
		RoutineID: routine.ID,
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: logged.ID, Sets: []repo.Set{{Reps: 5, Weight: 50}}},
			{ExerciseID: empty.ID, Sets: nil},
		},
		StartedAt:  time.Now().UTC(),
		FinishedAt: time.Now().UTC().Add(time.Hour),
	})
	s.Require().NoError(err)

	created, err := s.repo.ListSets(ctx, repo.ListSetsWithExerciseID(logged.ID, empty.ID))
	s.Require().NoError(err)
	s.Require().Len(created, 1)
	s.Require().Equal(logged.ID, created[0].ExerciseID)
	s.Require().Equal(workout.ID, created[0].WorkoutID)
}

func (s *repoSuite) TestUpdateWorkoutSetsDropsAnExerciseWithNoSets() {
	ctx := context.Background()
	user := s.factory.NewUser()
	workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
	logged := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	empty := s.factory.NewExercise(factory.ExerciseUserID(user.ID))

	s.Require().NoError(s.repo.UpdateWorkoutSets(ctx, repo.UpdateWorkoutSetsParams{
		WorkoutID: workout.ID,
		ExerciseSets: []repo.ExerciseSet{
			{ExerciseID: logged.ID, Sets: []repo.Set{{Reps: 5, Weight: 50}}},
			{ExerciseID: empty.ID, Sets: nil},
		},
	}))

	sets, err := s.repo.ListSets(ctx, repo.ListSetsWithExerciseID(logged.ID, empty.ID))
	s.Require().NoError(err)
	s.Require().Len(sets, 1)
	s.Require().Equal(logged.ID, sets[0].ExerciseID)
}

func (s *repoSuite) TestMarkFeedAsSeen() {
	ctx := context.Background()
	user := s.factory.NewUser()

	fresh, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID))
	s.Require().NoError(err)
	s.Require().True(fresh.FeedSeenAt.IsZero())

	s.Require().NoError(s.repo.MarkFeedAsSeen(ctx, user.ID))

	seen, err := s.repo.GetUser(ctx, repo.GetUserWithID(user.ID))
	s.Require().NoError(err)
	s.Require().WithinDuration(time.Now(), seen.FeedSeenAt, 5*time.Second)

	err = s.repo.MarkFeedAsSeen(ctx, uuid.Must(uuid.NewV4()))
	s.Require().ErrorIs(err, repo.ErrUpdateRowsAffected)
}
