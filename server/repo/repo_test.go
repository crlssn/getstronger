package repo_test

import (
	"context"
	"log"
	"testing"
	"time"

	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
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

	testContainer *container.Container
	testFactory   *factory.Factory
}

func TestRepoSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(repoSuite))
}

func (s *repoSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = container.NewContainer(ctx)
	s.testFactory = factory.NewFactory(s.testContainer.DB)
	s.repo = repo.New(s.testContainer.DB)
	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
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
				s.testFactory.NewAuth(factory.AuthEmail(t.email))
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

	user := s.testFactory.NewUser()

	tests := []test{
		{
			name: "ok_valid_access_token",
			opts: []repo.ListExercisesOpt{
				repo.ListExercisesWithUserID(user.ID),
				repo.ListExercisesWithLimit(2),
			},
			init: func(_ test) {
				s.testFactory.NewExercise(factory.ExerciseUserID(user.ID))
				s.testFactory.NewExercise(factory.ExerciseUserID(user.ID))
				s.testFactory.NewExercise(factory.ExerciseUserID(user.ID))
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
				s.testFactory.NewRoutine(
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
				s.testFactory.NewRoutine(
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
				s.testFactory.NewRoutine(
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

	exerciseIDs := []string{uuid.NewString(), uuid.NewString()}
	for _, exerciseID := range exerciseIDs {
		s.testFactory.NewExercise(factory.ExerciseID(exerciseID))
	}

	workoutIDs := []string{uuid.NewString(), uuid.NewString()}
	for _, workoutID := range workoutIDs {
		s.testFactory.NewWorkout(factory.WorkoutID(workoutID))
	}

	now := time.Now().UTC()

	tests := []test{
		{
			name:        "ok",
			exerciseIDs: exerciseIDs,
			init: func(t test) {
				s.testFactory.NewSet(factory.SetCreatedAt(now.Add(-time.Minute)))
				s.testFactory.NewSet(factory.SetCreatedAt(now.Add(-time.Minute)))

				for _, exerciseID := range t.exerciseIDs {
					s.testFactory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(now.Add(-time.Second)),
					)
					s.testFactory.NewSet(
						factory.SetExerciseID(exerciseID),
						factory.SetCreatedAt(now.Add(-time.Second)),
					)
				}

				for _, set := range t.expected.sets {
					s.testFactory.NewSet(
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
				workout := s.testFactory.NewWorkout(factory.WorkoutID(workoutID))
				s.testFactory.NewSet(factory.SetWorkoutID(workoutID))
				s.testFactory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workoutID))
				s.testFactory.NewNotification(factory.NotificationPayload(repo.NotificationPayload{
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
				user := s.testFactory.NewUser(factory.UserID(userID))
				workout := s.testFactory.NewWorkout(factory.WorkoutUserID(user.ID))
				s.testFactory.NewSet(factory.SetWorkoutID(workout.ID))
				s.testFactory.NewWorkoutComment(factory.WorkoutCommentWorkoutID(workout.ID))
				s.testFactory.NewNotification(factory.NotificationPayload(repo.NotificationPayload{
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
				Exists(context.Background(), s.testContainer.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.Sets(orm.SetWhere.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), s.testContainer.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.WorkoutComments(orm.WorkoutCommentWhere.WorkoutID.EQ(workout.ID)).
				Exists(context.Background(), s.testContainer.DB)
			s.Require().NoError(err)
			s.Require().False(exists)

			exists, err = orm.Notifications(qm.Where("payload ->> 'workoutId' = ?", workout.ID)).
				Exists(context.Background(), s.testContainer.DB)
			s.Require().NoError(err)
			s.Require().False(exists)
		})
	}
}
