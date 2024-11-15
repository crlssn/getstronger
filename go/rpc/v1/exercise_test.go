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

	ctx     context.Context
	handler apiv1connect.ExerciseServiceHandler

	testFactory   *testdb.Factory
	testContainer *testdb.Container
}

func TestExerciseSuite(t *testing.T) {
	suite.Run(t, new(exerciseSuite))
}

func (s *exerciseSuite) SetupSuite() {
	s.ctx = context.Background()
	s.testContainer = testdb.NewContainer(s.ctx)
	s.testFactory = testdb.NewFactory(s.ctx, s.testContainer.DB)
	s.handler = NewExerciseHandler(zap.NewExample(), repo.New(s.testContainer.DB))
}

func (s *exerciseSuite) TearDownSuite() {
	if err := s.testContainer.Terminate(s.ctx); err != nil {
		log.Fatalf("failed to terminate container: %s", err)
	}
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
					Name: "Bench Press",
				},
			},
			expected: expected{
				err: nil,
			},
		},
	}

	user := s.testFactory.NewUser()
	ctx := context.WithValue(s.ctx, jwt.ContextKeyUserID, user.ID)

	for _, t := range tests {
		res, err := s.handler.Create(ctx, t.req)
		if t.expected.err != nil {
			s.Require().Nil(res)
			s.Require().Error(err)
			s.Require().ErrorIs(err, t.expected.err)
			return
		}
		s.Require().Nil(err)
		s.Require().NotNil(res)
		_, err = uuid.Parse(res.Msg.Id)
		s.Require().Nil(err)
	}
}
