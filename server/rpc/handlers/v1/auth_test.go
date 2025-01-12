package v1_test

import (
	"context"
	"log"
	"testing"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/email"
	"github.com/crlssn/getstronger/server/gen/orm"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type authSuite struct {
	suite.Suite

	handler apiv1connect.AuthServiceHandler

	factory   *factory.Factory
	container *container.Container

	mocks struct {
		email      *email.MockEmail
		controller *gomock.Controller
	}
}

func TestAuthSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(authSuite))
}

func (s *authSuite) SetupSuite() {
	s.mocks.controller = gomock.NewController(s.T())
	s.mocks.email = email.NewMockEmail(s.mocks.controller)

	ctx := context.Background()
	s.container = container.NewContainer(ctx)
	s.factory = factory.NewFactory(s.container.DB)
	s.handler = handlers.NewAuthHandler(handlers.AuthHandlerParams{
		JWT:     jwt.NewManager([]byte("access-key"), []byte("refresh-key")),
		Repo:    repo.New(s.container.DB),
		Email:   s.mocks.email,
		Cookies: cookies.New(new(config.Config)),
	})

	s.T().Cleanup(func() {
		s.mocks.controller.Finish()
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("failed to clean container: %s", err)
		}
	})
}

func (s *authSuite) TestSignup() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.SignupRequest]
		init     func(t test)
		expected expected
	}

	tests := []test{
		{
			name: "ok",
			req: &connect.Request[v1.SignupRequest]{
				Msg: &v1.SignupRequest{
					Email:                gofakeit.Email(),
					Password:             "password",
					PasswordConfirmation: "password",
					FirstName:            gofakeit.FirstName(),
					LastName:             gofakeit.LastName(),
				},
			},
			init: func(t test) {
				s.mocks.email.EXPECT().
					SendVerification(gomock.Any(), gomock.Any()).
					Do(func(_ context.Context, req email.SendVerification) {
						s.Require().Equal(t.req.Msg.GetEmail(), req.Email)
						s.Require().Equal(t.req.Msg.GetFirstName(), req.Name)
						_, err := uuid.Parse(req.Token)
						s.Require().NoError(err)
					})
			},
			expected: expected{
				err: nil,
			},
		},
	}

	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			res, err := s.handler.Signup(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().ErrorIs(err, t.expected.err)
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			auth, err := orm.Auths(orm.AuthWhere.Email.EQ(t.req.Msg.GetEmail())).One(ctx, s.container.DB)
			s.Require().NoError(err)

			user, err := auth.User().One(ctx, s.container.DB)
			s.Require().NoError(err)

			s.Require().Equal(t.req.Msg.GetFirstName(), user.FirstName)
			s.Require().Equal(t.req.Msg.GetLastName(), user.LastName)
		})
	}
}
