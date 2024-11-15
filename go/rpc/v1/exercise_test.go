package v1

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	v1 "github.com/crlssn/getstronger/go/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/go/pkg/repo"
	"github.com/crlssn/getstronger/go/pkg/test/testdb"
)

type exerciseSuite struct {
	suite.Suite

	handler apiv1connect.ExerciseServiceHandler

	testFactory   *testdb.Factory
	testContainer *testdb.Container
}

func TestExerciseSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(exerciseSuite))
}

func (s *exerciseSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = testdb.NewContainer(ctx)
	s.testFactory = testdb.NewFactory(s.testContainer.DB)
	s.handler = NewExerciseHandler(zap.NewExample(), repo.New(s.testContainer.DB))

	s.T().Cleanup(func() {
		if err := s.testContainer.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *exerciseSuite) TestCreateExercise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.CreateExerciseRequest]
		expected expected
	}

	tests := []test{
		{
			name: "valid request",
			req: &connect.Request[v1.CreateExerciseRequest]{
				Msg: &v1.CreateExerciseRequest{
					Name:            "Bench Press",
					Label:           "",
					RestBetweenSets: nil,
				},
			},
			expected: expected{
				err: nil,
			},
		},
	}

	user := s.testFactory.NewUser()
	ctx := context.WithValue(context.Background(), jwt.ContextKeyUserID, user.ID)

	for _, t := range tests {
		res, err := s.handler.Create(ctx, t.req)
		if t.expected.err != nil {
			s.Require().Nil(res)
			s.Require().Error(err)
			s.Require().ErrorIs(err, t.expected.err)

			return
		}

		s.Require().NoError(err)
		s.Require().NotNil(res)
		_, err = uuid.Parse(res.Msg.GetId())
		s.Require().NoError(err)
	}
}
