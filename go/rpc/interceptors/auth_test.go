package interceptors

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"

	"github.com/crlssn/getstronger/go/pkg/jwt"
	"github.com/crlssn/getstronger/go/pkg/pb/api/v1/apiv1connect"
)

type authSuite struct {
	suite.Suite

	jwt         *jwt.Manager
	interceptor *auth
}

func TestAuthSuite(t *testing.T) {
	suite.Run(t, new(authSuite))
}

func (s *authSuite) SetupSuite() {
	s.jwt = jwt.NewManager([]byte("access-token"), []byte("refresh-token"))
	s.interceptor = NewAuthInterceptor(zap.NewExample(), s.jwt).(*auth)
}

func (s *authSuite) TestAuthorise() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		ctx      context.Context
		method   string
		expected expected
	}

	accessToken, err := s.jwt.CreateToken(uuid.NewString(), jwt.TokenTypeAccess)
	s.Require().NoError(err)

	tests := []test{
		{
			name:   "ok_valid_access_token",
			ctx:    metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", accessToken)),
			method: apiv1connect.AuthServiceRefreshTokenProcedure,
			expected: expected{
				err: nil,
			},
		},
		{
			name:   "err_missing_metadata",
			ctx:    context.Background(),
			method: apiv1connect.AuthServiceRefreshTokenProcedure,
			expected: expected{
				err: status.Error(codes.Unauthenticated, "missing metadata"),
			},
		},
		{
			name:   "err_missing_authorization_token",
			ctx:    metadata.NewIncomingContext(context.Background(), metadata.Pairs("key", "value")),
			method: apiv1connect.AuthServiceRefreshTokenProcedure,
			expected: expected{
				err: status.Error(codes.Unauthenticated, "authorization token is missing"),
			},
		},
		{
			name:   "err_invalid_authorization_token",
			ctx:    metadata.NewIncomingContext(context.Background(), metadata.Pairs("authorization", "")),
			method: apiv1connect.AuthServiceRefreshTokenProcedure,
			expected: expected{
				err: status.Error(codes.Unauthenticated, "invalid authorization token"),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			err = s.interceptor.authorize(t.ctx, t.method)
			if t.expected.err == nil {
				s.Require().Nil(err)
				return
			}
			s.Require().NotNil(err)
			s.Require().Equal(t.expected.err, err)
		})
	}
}
