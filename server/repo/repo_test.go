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

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/stretchr/testify/suite"
	"github.com/volatiletech/null/v8"
	"github.com/volatiletech/sqlboiler/v4/queries/qm"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
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
				exists, existsErr := orm.Auths(orm.AuthWhere.Email.EQ(emailNotCreated)).Exists(context.Background(), s.container.DB)
				s.Require().NoError(existsErr)
				s.Require().False(exists)
				return
			}
			s.Require().NoError(err)
			exists, err := orm.Auths(orm.AuthWhere.Email.EQ(emailCreated)).Exists(context.Background(), s.container.DB)
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
		auth     *orm.Auth
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
				t.expected.auth = s.factory.NewAuth(factory.AuthID(t.authID))
				t.expected.auth.PasswordResetToken = null.StringFrom(factory.UUID(0))
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
					factory.AuthPasswordResetToken(uuid.NewString()),
				)
				t.expected.auth.PasswordResetToken = null.String{}
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
				t.expected.auth.RefreshToken = null.StringFrom("refresh_token")
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
				t.expected.auth.RefreshToken = null.String{}
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

			auth, err := orm.FindAuth(context.Background(), s.container.DB, t.authID)
			s.Require().NoError(err)
			s.Require().Equal(t.expected.auth.Email, auth.Email)
			s.Require().Equal(t.expected.auth.EmailVerified, auth.EmailVerified)
			s.Require().Equal(t.expected.auth.RefreshToken.Valid, auth.RefreshToken.Valid)
			s.Require().Equal(t.expected.auth.RefreshToken.String, auth.RefreshToken.String)
			s.Require().Equal(t.expected.auth.PasswordResetToken.Valid, auth.PasswordResetToken.Valid)
			s.Require().Equal(t.expected.auth.PasswordResetToken.String, auth.PasswordResetToken.String)
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
		user *orm.User
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
				AuthID:    s.factory.NewAuth().ID,
				FirstName: "John",
				LastName:  "Doe",
			},
			init: func(_ test) {},
			expected: expected{
				user: &orm.User{
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
				err:  fmt.Errorf("user insert: orm: unable to insert into users: ERROR: invalid input syntax for type uuid: \"\" (SQLSTATE 22P02)"),
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
				err:  fmt.Errorf("user insert: orm: unable to insert into users: ERROR: insert or update on table \"users\" violates foreign key constraint \"users_auth_id_fkey\" (SQLSTATE 23503)"),
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
			s.Require().Equal(t.params.AuthID, user.AuthID)
			s.Require().Equal(t.expected.user.FirstName, user.FirstName)
			s.Require().Equal(t.expected.user.LastName, user.LastName)
		})
	}
}

func (s *repoSuite) TestCreateExercise() {
	type expected struct {
		exercise *orm.Exercise
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
			name: "ok_exercise_created_with_label",
			params: repo.CreateExerciseParams{
				UserID: s.factory.NewUser().ID,
				Name:   "Bench Press",
				Label:  "Chest",
			},
			init: func(_ test) {},
			expected: expected{
				exercise: &orm.Exercise{
					Title:    "Bench Press",
					SubTitle: null.NewString("Chest", true),
				},
				err: nil,
			},
		},
		{
			name: "ok_exercise_created_without_label",
			params: repo.CreateExerciseParams{
				UserID: s.factory.NewUser().ID,
				Name:   "Squat",
				Label:  "",
			},
			init: func(_ test) {},
			expected: expected{
				exercise: &orm.Exercise{
					Title:    "Squat",
					SubTitle: null.NewString("", false),
				},
				err: nil,
			},
		},
		{
			name: "err_unknown_user_id",
			params: repo.CreateExerciseParams{
				UserID: uuid.NewString(),
				Name:   "Deadlift",
				Label:  "Back",
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
			s.Require().Equal(t.expected.exercise.Title, exercise.Title)
			s.Require().Equal(t.expected.exercise.SubTitle, exercise.SubTitle)
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
		init     func(test) orm.RoutineSlice
		expected expected
	}

	tests := []test{
		{
			name: "ok_soft_delete_exercise_with_routines",
			params: repo.SoftDeleteExerciseParams{
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.NewString(),
			},
			init: func(t test) orm.RoutineSlice {
				exercises := orm.ExerciseSlice{
					s.factory.NewExercise(
						factory.ExerciseID(t.params.ExerciseID),
						factory.ExerciseUserID(t.params.UserID),
					),
					s.factory.NewExercise(
						factory.ExerciseUserID(t.params.UserID),
					),
				}

				routines := orm.RoutineSlice{
					s.factory.NewRoutine(
						factory.RoutineExerciseOrder([]string{
							exercises[0].ID, exercises[1].ID,
						}),
					),
					s.factory.NewRoutine(
						factory.RoutineExerciseOrder([]string{
							exercises[0].ID, exercises[1].ID,
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
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.NewString(),
			},
			init: func(t test) orm.RoutineSlice {
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
				UserID:     s.factory.NewUser().ID,
				ExerciseID: uuid.NewString(),
			},
			expected: expected{
				err: sql.ErrNoRows,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			var routines orm.RoutineSlice
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

			exists, err := orm.Exercises(
				orm.ExerciseWhere.ID.EQ(t.params.ExerciseID),
				orm.ExerciseWhere.DeletedAt.IsNull(),
			).Exists(context.Background(), s.container.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			s.Require().NoError(routines.ReloadAll(context.Background(), s.container.DB))
			for _, routine := range routines {
				exercises, exercisesErr := routine.Exercises().All(context.Background(), s.container.DB)
				s.Require().NoError(exercisesErr)

				for _, exercise := range exercises {
					s.Require().NotEqual(t.params.ExerciseID, exercise.ID, "Exercise should have been removed from the routine")
				}

				var exerciseIDs []string
				s.Require().NoError(json.Unmarshal(routine.ExerciseOrder, &exerciseIDs))
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
		sets orm.SetSlice
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

	now := time.Now().UTC()

	tests := []test{
		{
			name:        "ok",
			exerciseIDs: exerciseIDs,
			init: func(t test) {
				s.factory.NewSet(factory.SetCreatedAt(now.Add(-time.Minute)))
				s.factory.NewSet(factory.SetCreatedAt(now.Add(-time.Minute)))

				for _, exerciseID := range t.exerciseIDs {
					s.factory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(now.Add(-time.Second)),
					)
					s.factory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(now.Add(-time.Second)),
					)
				}

				for _, set := range t.expected.sets {
					s.factory.NewSet(
						factory.SetWorkoutID(set.WorkoutID),
						factory.SetExerciseID(set.ExerciseID),
						factory.SetReps(set.Reps),
						factory.SetWeight(set.Weight),
						factory.SetCreatedAt(set.CreatedAt),
					)
				}
			},
			expected: expected{
				err: nil,
				sets: orm.SetSlice{
					{
						WorkoutID:  workoutIDs[0],
						ExerciseID: exerciseIDs[0],
						Reps:       1,
						Weight:     1,
						CreatedAt:  now,
					},
					{
						WorkoutID:  workoutIDs[0],
						ExerciseID: exerciseIDs[0],
						Reps:       2,
						Weight:     2,
						CreatedAt:  now.Add(time.Second),
					},
					{
						WorkoutID:  workoutIDs[1],
						ExerciseID: exerciseIDs[1],
						Reps:       3,
						Weight:     3,
						CreatedAt:  now.Add(2 * time.Second),
					},
					{
						WorkoutID:  workoutIDs[1],
						ExerciseID: exerciseIDs[1],
						Reps:       4,
						Weight:     4,
						CreatedAt:  now.Add(3 * time.Second),
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
		init     func(test) *orm.Workout
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
			init: func(_ test) *orm.Workout {
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
			init: func(_ test) *orm.Workout {
				user := s.factory.NewUser(factory.UserID(userID))
				workout := s.factory.NewWorkout(factory.WorkoutUserID(user.ID))
				s.factory.NewSet(factory.SetWorkoutID(workout.ID))
				s.factory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID))
				s.factory.NewNotification(factory.NotificationPayload(repo.NotificationPayload{
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

			exists, err := orm.Workouts(orm.WorkoutWhere.ID.EQ(workout.ID)).
				Exists(context.Background(), s.container.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.Sets(orm.SetWhere.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), s.container.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.WorkoutComments(orm.WorkoutCommentWhere.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), s.container.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.Notifications(qm.Where("payload ->> 'workoutId' = ?", workout.ID)).
				Exists(context.Background(), s.container.DB)
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
			workout, err := orm.FindWorkout(context.Background(), s.container.DB, t.params.WorkoutID)
			s.Require().NoError(err)

			sets, err := workout.Sets().All(context.Background(), s.container.DB)
			s.Require().NoError(err)

			var setCount int
			var mapExpectedExerciseSets = make(map[string][]repo.Set)
			for _, exerciseSet := range t.params.ExerciseSets {
				setCount += len(exerciseSet.Sets)
				mapExpectedExerciseSets[exerciseSet.ExerciseID] = exerciseSet.Sets
			}

			var mapReceivedExerciseSets = make(map[string]orm.SetSlice)
			for _, set := range sets {
				mapReceivedExerciseSets[set.ExerciseID] = append(mapReceivedExerciseSets[set.ExerciseID], set)
			}

			s.Require().Len(sets, setCount)
			s.Require().Len(mapReceivedExerciseSets, len(mapExpectedExerciseSets))

			for exerciseID, receivedSets := range mapReceivedExerciseSets {
				expectedSets, ok := mapExpectedExerciseSets[exerciseID]
				s.Require().True(ok)

				for i, receivedSet := range receivedSets {
					s.Require().Equal(expectedSets[i].Reps, receivedSet.Reps)
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
		topic    orm.EventTopic
		payload  []byte
		expected expected
	}

	tests := []test{
		{
			name:    "ok_publish_event_with_notify",
			topic:   orm.EventTopicWorkoutCommentPosted,
			payload: []byte("{}"),
			expected: expected{
				err: nil,
			},
		},
		{
			name:    "err_invalid_topic",
			topic:   orm.EventTopic("not_found"),
			payload: nil,
			expected: expected{
				err: repo.ErrInvalidTopic,
			},
		},
		{
			name:    "err_empty_payload",
			topic:   orm.EventTopicWorkoutCommentPosted,
			payload: nil,
			expected: expected{
				err: repo.ErrEmptyPayload,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			var listener *pq.Listener
			if t.topic.IsValid() == nil {
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

			exists, err := orm.Events(
				orm.EventWhere.Topic.EQ(t.topic),
				orm.EventWhere.Payload.EQ(t.payload),
			).Exists(context.Background(), s.container.DB)
			s.Require().NoError(err)
			s.Require().True(exists)
		})
	}
}
