package v1

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	v1 "github.com/crlssn/getstronger/server/pkg/pb/api/v1"
	"github.com/crlssn/getstronger/server/pkg/pb/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/pkg/repo"
	testdb2 "github.com/crlssn/getstronger/server/pkg/test/testdb"
	"github.com/crlssn/getstronger/server/pkg/xcontext"
)

type exerciseSuite struct {
	suite.Suite

	handler apiv1connect.ExerciseServiceHandler

	testFactory   *testdb2.Factory
	testContainer *testdb2.Container
}

func TestExerciseSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(exerciseSuite))
}

func (s *exerciseSuite) SetupSuite() {
	ctx := context.Background()
	s.testContainer = testdb2.NewContainer(ctx)
	s.testFactory = testdb2.NewFactory(s.testContainer.DB)
	s.handler = NewExerciseHandler(repo.New(s.testContainer.DB))

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
					Name:  "Bench Press",
					Label: "",
				},
			},
			expected: expected{
				err: nil,
			},
		},
	}

	user := s.testFactory.NewUser()
	ctx := xcontext.WithUserID(context.Background(), user.ID)
	ctx = xcontext.WithLogger(ctx, zap.NewExample())

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