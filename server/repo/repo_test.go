//nolint:all
package repo_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"testing"
	"time"

	"github.com/aarondl/opt/null"
	"github.com/brianvoe/gofakeit/v7"
	gofrsuuid "github.com/gofrs/uuid/v5"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/suite"
	"golang.org/x/crypto/bcrypt"

	"github.com/stephenafamo/bob"
	"github.com/stephenafamo/bob/dialect/psql"
	"github.com/stephenafamo/bob/dialect/psql/sm"
	bobtypes "github.com/stephenafamo/bob/types"

	"github.com/crlssn/getstronger/server/gen/models"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/weightunit"
)

type repoSuite struct {
	suite.Suite

	repo repo.Repo

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
			log.Fatalf("failed to clean container: %s", err)
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
		tx       func(tx repo.Tx) error
		expected expected
	}

	emailCreated := gofakeit.Email()
	emailNotCreated := gofakeit.Email()

	tests := []test{
		{
			name: "ok_transaction_committed",
			tx: func(tx repo.Tx) error {
				_, err := tx.CreateAuth(context.Background(), emailCreated, "password")
				s.Require().NoError(err)
				return nil
			},
			expected: expected{err: nil},
		},
		{
			name: "err_transaction_not_committed",
			tx: func(tx repo.Tx) error {
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
			name:     "err_email_already_exists",
			email:    gofakeit.Email(),
			password: "password",
			init: func(t test) {
				s.factory.NewAuth(factory.AuthEmail(t.email))
			},
			expected: expected{
				err: repo.ErrAuthEmailExists,
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
			s.Require().Equal(t.email, auth.Email)
			s.Require().NoError(bcrypt.CompareHashAndPassword(auth.Password, []byte(t.password)))
		})
	}
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
					factory.AuthPasswordResetToken(factory.UUID(0), repo.PasswordResetTokenTTL),
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
				AuthID:    s.factory.NewAuth().ID.String(),
				FirstName: "John",
				LastName:  "Doe",
			},
			init: func(_ test) {},
			expected: expected{
				user: &models.User{
					FirstName: "John",
					LastName:  "Doe",
				},
				err: nil,
			},
		},
		{
			name: "err_auth_id_missing",
			params: repo.CreateUserParams{
				AuthID:    "",
				FirstName: "John",
				LastName:  "Doe",
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
				AuthID:    uuid.NewString(),
				FirstName: "Jane",
				LastName:  "Doe",
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
				s.Require().ErrorContains(err, t.expected.err.Error())
				s.Require().Nil(user)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(user)
			s.Require().Equal(t.params.AuthID, user.AuthID.String())
			s.Require().Equal(t.expected.user.FirstName, user.FirstName)
			s.Require().Equal(t.expected.user.LastName, user.LastName)
		})
	}
}

func (s *repoSuite) TestUpdateUser() {
	type expected struct {
		err        error
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
		init     func(test) models.RoutineSlice
		expected expected
	}

	tests := []test{
		{
			name: "ok_soft_delete_exercise_with_routines",
			params: repo.SoftDeleteExerciseParams{
				UserID:     s.factory.NewUser().ID.String(),
				ExerciseID: uuid.NewString(),
			},
			init: func(t test) models.RoutineSlice {
				exercises := models.ExerciseSlice{
					s.factory.NewExercise(
						factory.ExerciseID(t.params.ExerciseID),
						factory.ExerciseUserID(t.params.UserID),
					),
					s.factory.NewExercise(
						factory.ExerciseUserID(t.params.UserID),
					),
				}

				routines := models.RoutineSlice{
					s.factory.NewRoutine(
						factory.RoutineExerciseOrder([]string{
							exercises[0].ID.String(), exercises[1].ID.String(),
						}),
					),
					s.factory.NewRoutine(
						factory.RoutineExerciseOrder([]string{
							exercises[0].ID.String(), exercises[1].ID.String(),
						}),
					),
				}

				s.factory.AddRoutineExercise(routines[0], exercises...)
				s.factory.AddRoutineExercise(routines[1], exercises...)

				return routines
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
			init: func(t test) models.RoutineSlice {
				s.factory.NewExercise(
					factory.ExerciseID(t.params.ExerciseID),
					factory.ExerciseUserID(t.params.UserID),
				)
				return nil
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
			if t.init != nil {
				routines = t.init(t)
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
				exercises, exercisesErr := routine.Exercises().All(context.Background(), bob.NewDB(s.container.DB))
				s.Require().NoError(exercisesErr)

				for _, exercise := range exercises {
					s.Require().NotEqual(t.params.ExerciseID, exercise.ID.String(), "Exercise should have been removed from the routine")
				}

				var exerciseIDs []string
				s.Require().NoError(json.Unmarshal(routine.ExerciseOrder.Val, &exerciseIDs))
				for _, id := range exerciseIDs {
					s.Require().NotEqual(t.params.ExerciseID, id, "Exercise should have been removed from the routine's exercise order")
				}
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
			name:      "ok_update_exercise_order",
			routineID: uuid.NewString(),
			opts: []repo.UpdateRoutineOpt{
				repo.UpdateRoutineExerciseOrder([]string{"1", "2"}),
			},
			init: func(t test) {
				s.factory.NewRoutine(
					factory.RoutineID(t.routineID),
					factory.RoutineExerciseOrder([]string{"2", "1"}),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:      "ok_update_name_and_exercise_order",
			routineID: uuid.NewString(),
			opts: []repo.UpdateRoutineOpt{
				repo.UpdateRoutineName("new"),
				repo.UpdateRoutineExerciseOrder([]string{"1", "2"}),
			},
			init: func(t test) {
				s.factory.NewRoutine(
					factory.RoutineID(t.routineID),
					factory.RoutineName("old"),
					factory.RoutineExerciseOrder([]string{"2", "1"}),
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
				s.factory.NewNotification(factory.NotificationPayload(repo.NotificationPayload{
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
				s.factory.NewNotification(factory.NotificationPayload(repo.NotificationPayload{
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
		topic    repo.EventTopic
		payload  []byte
		expected expected
	}

	tests := []test{
		{
			name:    "ok_publish_event_with_notify",
			topic:   repo.EventTopicWorkoutCommentPosted,
			payload: []byte("{}"),
			expected: expected{
				err: nil,
			},
		},
		{
			name:    "err_invalid_topic",
			topic:   repo.EventTopic("not_found"),
			payload: nil,
			expected: expected{
				err: repo.ErrInvalidTopic,
			},
		},
		{
			name:    "err_empty_payload",
			topic:   repo.EventTopicWorkoutCommentPosted,
			payload: nil,
			expected: expected{
				err: repo.ErrEmptyPayload,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			var listener *pq.Listener
			if t.topic.Valid() {
				listener = pq.NewListener(s.container.Connection, time.Second, time.Minute, nil)
				s.Require().NoError(listener.Listen(t.topic.String()))
			}

			err := s.repo.PublishEvent(context.Background(), t.topic, t.payload)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}
			s.Require().NoError(err)

			notification := <-listener.Notify
			s.Require().Equal(t.topic.String(), notification.Channel)
			s.Require().Equal(string(t.payload), notification.Extra)

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
