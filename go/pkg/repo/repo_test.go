package repo

import (
	"context"
	"log"
	"testing"

	"github.com/stretchr/testify/suite"
	"github.com/volatiletech/null/v8"

	"github.com/crlssn/getstronger/go/pkg/test/testdb"
)

type repoSuite struct {
	suite.Suite

	repo *Repo

	ctx           context.Context
	testContainer *testdb.Container
	testFactory   *testdb.Factory
}

func TestAuthSuite(t *testing.T) {
	suite.Run(t, new(repoSuite))
}

func (s *repoSuite) SetupSuite() {
	s.ctx = context.Background()
	s.testContainer = testdb.NewContainer(s.ctx)
	s.testFactory = testdb.NewFactory(s.ctx, s.testContainer.DB)
	s.repo = New(s.testContainer.DB)
}

func (s *repoSuite) TearDownSuite() {
	if err := s.testContainer.Terminate(s.ctx); err != nil {
		log.Fatalf("failed to terminate container: %s", err)
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
		req      ListExercisesParams
		init     func(test)
		expected expected
	}

	user := s.testFactory.NewUser()

	tests := []test{
		{
			name: "ok_valid_access_token",
			req: ListExercisesParams{
				UserID:    user.ID,
				Name:      null.String{},
				Limit:     2,
				PageToken: nil,
			},
			init: func(test test) {
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
			exercises, nextPageToken, err := s.repo.ListExercises(s.ctx, t.req)
			if t.expected.err != nil {
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			s.Require().Len(exercises, t.expected.exercises)
			if t.expected.nextPageToken {
				s.Require().NotNil(nextPageToken)
			} else {
				s.Require().Nil(nextPageToken)
			}
		})
	}
}
