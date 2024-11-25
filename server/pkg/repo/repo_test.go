package repo

import (
	"context"
	"log"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/server/pkg/orm"
	testdb "github.com/crlssn/getstronger/server/pkg/test/testdb"
)

type repoSuite struct {
	suite.Suite

	repo *Repo

	testContainer *testdb.Container
	testFactory   *testdb.Factory
}

func TestRepoSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(repoSuite))
}

func (s *repoSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = testdb.NewContainer(ctx)
	s.testFactory = testdb.NewFactory(s.testContainer.DB)
	s.repo = New(s.testContainer.DB)
	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *repoSuite) TestListExercises() {
	type expected struct {
		err           error
		exercises     int
		nextPageToken bool
	}

	type test struct {
		name     string
		opts     []ListExercisesOpt
		init     func(test)
		expected expected
	}

	user := s.testFactory.NewUser()

	tests := []test{
		{
			name: "ok_valid_access_token",
			opts: []ListExercisesOpt{
				ListExercisesWithUserID(user.ID),
				ListExercisesWithLimit(2),
			},
			init: func(_ test) {
				s.testFactory.NewExercise(testdb.ExerciseUserID(user.ID))
				s.testFactory.NewExercise(testdb.ExerciseUserID(user.ID))
				s.testFactory.NewExercise(testdb.ExerciseUserID(user.ID))
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
		opts      []UpdateRoutineOpt
		init      func(test)
		expected  expected
	}

	tests := []test{
		{
			name:      "ok_update_routine_name",
			routineID: uuid.NewString(),
			opts: []UpdateRoutineOpt{
				UpdateRoutineName("new"),
			},
			init: func(t test) {
				s.testFactory.NewRoutine(
					testdb.RoutineID(t.routineID),
					testdb.RoutineName("old"),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:      "ok_update_exercise_order",
			routineID: uuid.NewString(),
			opts: []UpdateRoutineOpt{
				UpdateRoutineExerciseOrder([]string{"1", "2"}),
			},
			init: func(t test) {
				s.testFactory.NewRoutine(
					testdb.RoutineID(t.routineID),
					testdb.RoutineExerciseOrder([]string{"2", "1"}),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:      "ok_update_name_and_exercise_order",
			routineID: uuid.NewString(),
			opts: []UpdateRoutineOpt{
				UpdateRoutineName("new"),
				UpdateRoutineExerciseOrder([]string{"1", "2"}),
			},
			init: func(t test) {
				s.testFactory.NewRoutine(
					testdb.RoutineID(t.routineID),
					testdb.RoutineName("old"),
					testdb.RoutineExerciseOrder([]string{"2", "1"}),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:      "err_duplicate_column_update",
			routineID: uuid.NewString(),
			opts: []UpdateRoutineOpt{
				UpdateRoutineName("new"),
				UpdateRoutineName("newer"),
			},
			init: func(_ test) {},
			expected: expected{
				err: errDuplicateColumn,
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

func (s *repoSuite) TestGetPreviousSets() {
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
		s.testFactory.NewExercise(testdb.ExerciseID(exerciseID))
	}

	workoutIDs := []string{uuid.NewString(), uuid.NewString()}
	for _, workoutID := range workoutIDs {
		s.testFactory.NewWorkout(testdb.WorkoutID(workoutID))
	}

	now := time.Now().UTC()

	tests := []test{
		{
			name:        "ok",
			exerciseIDs: exerciseIDs,
			init: func(t test) {
				s.testFactory.NewSet(testdb.SetCreatedAt(now.Add(-time.Minute)))
				s.testFactory.NewSet(testdb.SetCreatedAt(now.Add(-time.Minute)))

				for _, exerciseID := range t.exerciseIDs {
					s.testFactory.NewSet(
						testdb.SetExerciseID(exerciseID),
						testdb.SetCreatedAt(now.Add(-time.Second)),
					)
					s.testFactory.NewSet(
						testdb.SetExerciseID(exerciseID),
						testdb.SetCreatedAt(now.Add(-time.Second)),
					)
				}

				for _, set := range t.expected.sets {
					s.testFactory.NewSet(
						testdb.SetWorkoutID(set.WorkoutID),
						testdb.SetExerciseID(set.ExerciseID),
						testdb.SetReps(set.Reps),
						testdb.SetWeight(set.Weight),
						testdb.SetCreatedAt(set.CreatedAt),
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
			sets, err := s.repo.GetPreviousSets(context.Background(), t.exerciseIDs)
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
