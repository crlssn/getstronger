//nolint:all
package repo_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/aarondl/opt/null"
	"github.com/aarondl/opt/omit"
	"github.com/brianvoe/gofakeit/v7"
	gofrsuuid "github.com/gofrs/uuid/v5"
	"github.com/google/uuid"
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
			s.Require().NoError(bcrypt.CompareHashAndPassword(auth.Password, []byte(t.password)))
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
		authID   string
		opts     []repo.UpdateAuthOpt
	}

	tests := []test{
		{
			name:   "ok_update_auth_password",
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
			opts: []repo.UpdateAuthOpt{
				repo.UpdateAuthDeletePasswordResetToken(),
			},
			init: func(t *test) {
				t.expected.auth = s.factory.NewAuth(
					factory.AuthID(t.authID),
				)
				t.expected.auth.PasswordResetToken = null.Val[gofrsuuid.UUID]{}
				t.expected.auth.PasswordResetTokenValidUntil = null.Val[time.Time]{}
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "ok_update_auth_refresh_token",
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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
			authID: uuid.NewString(),
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

			auth, err := models.FindAuth(context.Background(), bob.NewDB(s.container.DB), nativeUUID(t.authID))
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
				AuthID:   s.factory.NewAuth().ID.String(),
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
				AuthID:   s.factory.NewAuth().ID.String(),
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
				AuthID:   s.factory.NewAuth().ID.String(),
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
				AuthID:   "",
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
				AuthID:   uuid.NewString(),
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
			s.Require().Equal(t.params.AuthID, user.AuthID.String())
			s.Require().Equal(t.expected.user.Name, user.Name)
			s.Require().Equal(t.expected.user.Username, user.Username)
			s.Require().Equal(string(weightunit.Kilograms), user.WeightUnit)
			s.Require().Equal(string(distanceunit.Kilometers), user.DistanceUnit)
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
		userID   string
		expected expected
	}

	tests := []test{
		{
			name: "ok_update_weight_unit_pounds",
			opts: []repo.UpdateUserOpt{
				repo.UpdateUserWeightUnit(string(weightunit.Pounds)),
			},
			init: func(t *test) {
				t.userID = s.factory.NewUser(factory.UserWeightUnit(weightunit.Kilograms)).ID.String()
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
				t.userID = s.factory.NewUser(factory.UserWeightUnit(weightunit.Pounds)).ID.String()
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
				t.userID = s.factory.NewUser().ID.String()
			},
			expected: expected{
				err:  nil,
				name: "Robin  Fields",
			},
		},
		{
			name:   "err_unknown_user_id",
			userID: uuid.NewString(),
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
			user, err := models.Users.Query(models.SelectWhere.Users.ID.EQ(gofrsuuid.FromStringOrNil(t.userID))).One(context.Background(), bob.NewDB(s.container.DB))
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
				UserID: s.factory.NewUser().ID.String(),
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
				UserID: s.factory.NewUser().ID.String(),
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
				UserID: uuid.NewString(),
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
			s.Require().Equal(t.params.UserID, exercise.UserID.String())
			s.Require().Equal(t.expected.exercise.Title, exercise.Title)
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
				UserID:     s.factory.NewUser().ID.String(),
				ExerciseID: uuid.NewString(),
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
				UserID:     s.factory.NewUser().ID.String(),
				ExerciseID: uuid.NewString(),
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
				UserID:     s.factory.NewUser().ID.String(),
				ExerciseID: uuid.NewString(),
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
				models.SelectWhere.Exercises.ID.EQ(nativeUUID(t.params.ExerciseID)),
				models.SelectWhere.Exercises.DeletedAt.IsNull(),
			).Exists(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(exists)

			s.Require().NoError(routines.ReloadAll(context.Background(), bob.NewDB(s.container.DB)))
			for _, routine := range routines {
				fetched, fetchErr := s.repo.GetRoutine(
					context.Background(),
					repo.GetRoutineWithID(routine.ID.String()),
					repo.GetRoutineWithExercises(),
				)
				s.Require().NoError(fetchErr)

				exerciseIDs := make([]string, 0, len(fetched.R.Exercises))
				for _, exercise := range fetched.R.Exercises {
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
				repo.ListExercisesWithUserID(user.ID.String()),
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

	count, err := s.repo.CountSets(ctx, repo.CountSetsWithExerciseID(exercise.ID.String()))
	s.Require().NoError(err)
	s.Require().Zero(count)

	s.factory.NewSetSlice(2, factory.SetUserID(user.ID), factory.SetExerciseID(exercise.ID))
	s.factory.NewSet(factory.SetUserID(user.ID), factory.SetExerciseID(other.ID))

	count, err = s.repo.CountSets(ctx, repo.CountSetsWithExerciseID(exercise.ID.String()))
	s.Require().NoError(err)
	s.Require().Equal(int64(2), count)
}

func (s *repoSuite) TestUpdateRoutine() {
	type expected struct {
		err error
	}

	type test struct {
		name      string
		routineID string
		opts      []repo.UpdateRoutineOpt
		init      func(test)
		expected  expected
	}

	tests := []test{
		{
			name:      "ok_update_routine_name",
			routineID: uuid.NewString(),
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
			routineID: uuid.NewString(),
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

// TestGetRoutineExercisesAreStablyOrdered guards against the routine detail page showing a
// different exercise order on every load. Without an ORDER BY, Postgres is free to return the rows
// in heap order, and any write to an exercise row relocates it within the heap. The no-op update
// below changes no data at all, yet is enough to reshuffle an unordered result; the position
// column recorded on the relationship table must keep the order fixed.
func (s *repoSuite) TestGetRoutineExercisesAreStablyOrdered() {
	ctx := context.Background()
	userID := s.factory.NewUser().ID.String()
	routineID := uuid.NewString()

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

		exerciseIDs := make([]string, 0, len(fetched.R.Exercises))
		for _, exercise := range fetched.R.Exercises {
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
func (s *repoSuite) routineExerciseIDs(routineID string) []string {
	fetched, err := s.repo.GetRoutine(
		context.Background(),
		repo.GetRoutineWithID(routineID),
		repo.GetRoutineWithExercises(),
	)
	s.Require().NoError(err)

	exerciseIDs := make([]string, 0, len(fetched.R.Exercises))
	for _, exercise := range fetched.R.Exercises {
		exerciseIDs = append(exerciseIDs, exercise.ID.String())
	}
	return exerciseIDs
}

func (s *repoSuite) TestCreateRoutineKeepsRequestedExerciseOrder() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))

	// Deliberately not the creation order of the exercises.
	exerciseIDs := []string{
		exercises[2].ID.String(),
		exercises[0].ID.String(),
		exercises[1].ID.String(),
	}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID.String(),
		Name:        "Legs",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)
	s.Require().Equal(exerciseIDs, s.routineExerciseIDs(routine.ID.String()))
}

// routineExercises names a group's exercises, none of them overriding the rest
// the exercise library already says they take.
func routineExercises(ids ...string) []training.RoutineExerciseDraft {
	drafts := make([]training.RoutineExerciseDraft, 0, len(ids))
	for _, id := range ids {
		drafts = append(drafts, training.RoutineExerciseDraft{ExerciseID: id})
	}

	return drafts
}

func (s *repoSuite) routineGroupExerciseIDs(routineID string) [][]string {
	groups, err := s.repo.ListRoutineGroups(context.Background(), routineID)
	s.Require().NoError(err)

	grouped := make([][]string, 0, len(groups))
	for _, group := range groups {
		exerciseIDs := make([]string, 0, len(group.Exercises))
		for _, exercise := range group.Exercises {
			exerciseIDs = append(exerciseIDs, exercise.Exercise.ID.String())
		}
		grouped = append(grouped, exerciseIDs)
	}
	return grouped
}

func (s *repoSuite) TestCreateRoutineWithoutGroupsHoldsOneStraightGroup() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	exerciseIDs := []string{exercises[0].ID.String(), exercises[1].ID.String()}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID.String(),
		Name:        "Legs",
		ExerciseIDs: exerciseIDs,
	})
	s.Require().NoError(err)

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID.String())
	s.Require().NoError(err)
	s.Require().Len(groups, 1)
	s.Require().Equal(training.RoutineGroupModeStraight, groups[0].Mode)
	s.Require().Equal([][]string{exerciseIDs}, s.routineGroupExerciseIDs(routine.ID.String()))
}

func (s *repoSuite) TestCreateRoutineWithGroups() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	warmUpID := exercises[0].ID.String()
	circuitIDs := []string{exercises[1].ID.String(), exercises[2].ID.String()}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID.String(),
		Name:        "Full body",
		ExerciseIDs: append([]string{warmUpID}, circuitIDs...),
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

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID.String())
	s.Require().NoError(err)
	s.Require().Len(groups, 2)

	s.Require().Equal(training.RoutineGroupModeStraight, groups[0].Mode)
	s.Require().Equal(training.RoutineGroupModeCircuit, groups[1].Mode)
	s.Require().Equal(int32(15), groups[1].RestBetweenExercisesSeconds)
	s.Require().Equal(int32(90), groups[1].RestBetweenRoundsSeconds)
	s.Require().Equal(int32(3), groups[1].Rounds)

	s.Require().Equal([][]string{{warmUpID}, circuitIDs}, s.routineGroupExerciseIDs(routine.ID.String()))
	// The flat exercise order is the groups read end to end.
	s.Require().Equal(append([]string{warmUpID}, circuitIDs...), s.routineExerciseIDs(routine.ID.String()))
}

func (s *repoSuite) TestSetRoutineGroupsReplacesTheWholeStructure() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := []string{exercises[0].ID.String(), exercises[1].ID.String(), exercises[2].ID.String()}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID.String(),
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
	}, exercises))

	s.Require().Equal(
		[][]string{{exerciseIDs[2]}, {exerciseIDs[0], exerciseIDs[1]}},
		s.routineGroupExerciseIDs(routine.ID.String()),
	)
	s.Require().Equal(
		[]string{exerciseIDs[2], exerciseIDs[0], exerciseIDs[1]},
		s.routineExerciseIDs(routine.ID.String()),
	)
}

// The whole point of the per-occurrence rest: the routine's own answer survives
// a save and a reload, and a save that says nothing gets the rest a new
// occurrence starts at rather than no rest at all.
func (s *repoSuite) TestSetRoutineGroupsKeepsThePerExerciseRest() {
	user := s.factory.NewUser()
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	exerciseIDs := []string{exercises[0].ID.String(), exercises[1].ID.String(), exercises[2].ID.String()}

	routine, err := s.repo.CreateRoutine(context.Background(), repo.CreateRoutineParams{
		UserID:      user.ID.String(),
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
	}, exercises))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID.String())
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
		UserID:      user.ID.String(),
		Name:        "Core day",
		ExerciseIDs: []string{lift.ID.String(), plank.ID.String()},
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.SetRoutineGroups(context.Background(), routine, []training.RoutineGroupDraft{
		{
			Mode: training.RoutineGroupModeStraight,
			Exercises: []training.RoutineExerciseDraft{
				{ExerciseID: lift.ID.String()},
				{ExerciseID: plank.ID.String()},
			},
		},
	}, exercises))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID.String())
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
		UserID: user.ID.String(),
		Name:   "Core day",
	})
	s.Require().NoError(err)

	lift := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	plank := s.factory.NewExercise(
		factory.ExerciseUserID(user.ID),
		factory.ExerciseMetrics(training.MetricTime.String()),
	)
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), lift, routine))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), plank, routine))

	groups, err := s.repo.ListRoutineGroups(context.Background(), routine.ID.String())
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
		UserID:      user.ID.String(),
		Name:        "Full body",
		ExerciseIDs: []string{exercises[0].ID.String(), exercises[1].ID.String()},
		Groups: []training.RoutineGroupDraft{
			{Mode: training.RoutineGroupModeStraight, Exercises: routineExercises(exercises[0].ID.String())},
			{Mode: training.RoutineGroupModeCircuit, Exercises: routineExercises(exercises[1].ID.String())},
		},
	})
	s.Require().NoError(err)

	added := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), added, routine))

	s.Require().Equal(
		[][]string{{exercises[0].ID.String()}, {exercises[1].ID.String(), added.ID.String()}},
		s.routineGroupExerciseIDs(routine.ID.String()),
	)
}

func (s *repoSuite) TestAddExerciseToRoutinePlacesLast() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercises := s.factory.NewExerciseSlice(2, factory.ExerciseUserID(user.ID))
	s.factory.AddRoutineExercise(routine, exercises...)

	added := s.factory.NewExercise(factory.ExerciseUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), added, routine))

	s.Require().Equal(
		[]string{exercises[0].ID.String(), exercises[1].ID.String(), added.ID.String()},
		s.routineExerciseIDs(routine.ID.String()),
	)

	// An empty routine gets position one rather than an error from the missing maximum.
	emptyRoutine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	s.Require().NoError(s.repo.AddExerciseToRoutine(context.Background(), added, emptyRoutine))
	s.Require().Equal([]string{added.ID.String()}, s.routineExerciseIDs(emptyRoutine.ID.String()))
}

func (s *repoSuite) TestUpdateRoutineExerciseOrder() {
	user := s.factory.NewUser()
	routine := s.factory.NewRoutine(factory.RoutineUserID(user.ID))
	exercises := s.factory.NewExerciseSlice(3, factory.ExerciseUserID(user.ID))
	s.factory.AddRoutineExercise(routine, exercises...)

	newOrder := []string{
		exercises[1].ID.String(),
		exercises[2].ID.String(),
		exercises[0].ID.String(),
	}
	s.Require().NoError(s.repo.UpdateRoutineExerciseOrder(context.Background(), routine.ID.String(), newOrder))

	s.Require().Equal(newOrder, s.routineExerciseIDs(routine.ID.String()))
}

func (s *repoSuite) TestGetPreviousWorkoutSets() {
	type expected struct {
		err  error
		sets models.SetSlice
	}

	type test struct {
		name        string
		exerciseIDs []string
		init        func(test)
		expected    expected
	}

	exerciseIDs := []string{factory.UUID(0), factory.UUID(1)}
	for _, exerciseID := range exerciseIDs {
		s.factory.NewExercise(factory.ExerciseID(exerciseID))
	}

	workoutIDs := []string{factory.UUID(0), factory.UUID(1)}
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
						WorkoutID:  nativeUUID(workoutIDs[0]),
						ExerciseID: nativeUUID(exerciseIDs[0]),
						Reps:       1,
						Weight:     1,
						CreatedAt:  s.factory.Now(),
					},
					{
						WorkoutID:  nativeUUID(workoutIDs[0]),
						ExerciseID: nativeUUID(exerciseIDs[0]),
						Reps:       2,
						Weight:     2,
						CreatedAt:  s.factory.Now().Add(time.Second),
					},
					{
						WorkoutID:  nativeUUID(workoutIDs[1]),
						ExerciseID: nativeUUID(exerciseIDs[1]),
						Reps:       3,
						Weight:     3,
						CreatedAt:  s.factory.Now().Add(2 * time.Second),
					},
					{
						WorkoutID:  nativeUUID(workoutIDs[1]),
						ExerciseID: nativeUUID(exerciseIDs[1]),
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

	userID := uuid.NewString()
	workoutID := uuid.NewString()

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
					WorkoutID: workout.ID.String(),
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
		UserID:     user.ID.String(),
		Name:       "Plan",
		RoutineIDs: []string{routine.ID.String()},
	})
	s.Require().NoError(err)

	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: user.ID.String(),
		FolloweeID: other.ID.String(),
	}))

	own := s.factory.NewNotification(factory.NotificationUserID(user.ID))
	// The follow notification sitting in someone else's list names the leaving
	// account as its actor, and would otherwise keep their badge lit forever.
	aboutUser := s.factory.NewNotification(
		factory.NotificationUserID(other.ID),
		factory.NotificationPayload(notification.Payload{ActorID: user.ID.String()}),
	)
	unrelated := s.factory.NewNotification(factory.NotificationUserID(other.ID))

	s.Require().NoError(s.repo.DeleteUser(ctx, user.ID.String()))

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

	_, err = s.repo.GetPlan(ctx, plan.ID, user.ID.String())
	s.Require().ErrorIs(err, sql.ErrNoRows)
}

func (s *repoSuite) TestDeleteUserNotFound() {
	err := s.repo.DeleteUser(context.Background(), uuid.NewString())
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
				WorkoutID: uuid.NewString(),
				ExerciseSets: []repo.ExerciseSet{
					{
						ExerciseID: uuid.NewString(),
						Sets: []repo.Set{
							{
								Reps:   1,
								Weight: 2,
							},
						},
					},
					{
						ExerciseID: uuid.NewString(),
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
			workout, err := models.FindWorkout(context.Background(), bob.NewDB(s.container.DB), nativeUUID(t.params.WorkoutID))
			s.Require().NoError(err)

			sets, err := workout.Sets(
				sm.OrderBy(models.Sets.Columns.CreatedAt),
			).All(context.Background(), bob.NewDB(s.container.DB))
			s.Require().NoError(err)

			for i, set := range sets {
				s.Require().Equal(workout.CreatedAt.Add(time.Duration(i*2)*time.Minute), set.CreatedAt)
			}

			var setCount int
			mapExpectedExerciseSets := make(map[string][]repo.Set)
			for _, exerciseSet := range t.params.ExerciseSets {
				setCount += len(exerciseSet.Sets)
				mapExpectedExerciseSets[exerciseSet.ExerciseID] = exerciseSet.Sets
			}

			mapReceivedExerciseSets := make(map[string]models.SetSlice)
			for _, set := range sets {
				mapReceivedExerciseSets[set.ExerciseID.String()] = append(mapReceivedExerciseSets[set.ExerciseID.String()], set)
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
				ID: nativeUUID(uuid.NewString()),
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
			err := s.repo.UpdateWorkout(context.Background(), t.workout.ID.String(), t.opts...)
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
		FollowerID: follower.ID.String(),
		FolloweeID: user.ID.String(),
	}))
	s.Require().NoError(s.repo.Follow(ctx, repo.FollowParams{
		FollowerID: user.ID.String(),
		FolloweeID: followee.ID.String(),
	}))

	followers, err := s.repo.ListFollowers(ctx, user.ID.String())
	s.Require().NoError(err)
	s.Require().Len(followers, 1)
	s.Require().Equal(follower.ID, followers[0].ID)

	followees, err := s.repo.ListFollowees(ctx, user.ID.String())
	s.Require().NoError(err)
	s.Require().Len(followees, 1)
	s.Require().Equal(followee.ID, followees[0].ID)
}
