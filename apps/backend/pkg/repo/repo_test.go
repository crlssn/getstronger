package repo

import (
	"context"
	"log"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/apps/backend/pkg/test/testdb"
)

type repoSuite struct {
	suite.Suite

	repo *Repo

	testContainer *testdb.Container
	testFactory   *testdb.Factory
}

func TestAuthSuite(t *testing.T) {
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
