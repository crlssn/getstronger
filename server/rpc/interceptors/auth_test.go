package interceptors_test

import (
	"context"
	"fmt"
	"maps"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
)

type authSuite struct {
	suite.Suite

	jwt         *jwt.Issuer
	interceptor *interceptors.Auth
}

func TestAuthSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(authSuite))
}

func (s *authSuite) SetupSuite() {
	s.jwt = jwt.NewIssuer([]byte("access-token"), []byte("refresh-token"))

	interceptor, ok := interceptors.NewAuth(zap.NewExample(), s.jwt).(*interceptors.Auth)
	s.Require().True(ok)

	s.interceptor = interceptor
}

func (s *authSuite) TestClaimsFromHeader() {
	type expected struct {
		err    error
		claims *jwt.Claims
	}

	type test struct {
		name     string
		expected expected
		header   http.Header
	}

	userID := uuid.NewString()
	accessToken, accessTokenErr := s.jwt.CreateToken(userID, jwt.TokenTypeAccess)
	s.Require().NoError(accessTokenErr)

	tests := []test{
		{
			name: "ok_valid_access_token",
			header: map[string][]string{
				"Authorization": {fmt.Sprintf("Bearer %s", accessToken)},
			},
			expected: expected{
				err: nil,
				claims: &jwt.Claims{
					UserID: userID,
				},
			},
		},
		{
			name:   "err_missing_authorization_token",
			header: map[string][]string{},
			expected: expected{
				err:    interceptors.ErrMissingAuthorizationToken,
				claims: nil,
			},
		},
		{
			name: "err_invalid_authorization_token",
			header: map[string][]string{
				"Authorization": {accessToken},
			},
			expected: expected{
				err:    interceptors.ErrInvalidAuthorizationToken,
				claims: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			claims, err := s.interceptor.ClaimsFromHeader(t.header)
			if t.expected.err != nil {
				s.Require().Nil(claims)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err, err)
				return
			}
			s.Require().NoError(err)
			s.Require().NotNil(claims)
			s.Require().Equal(t.expected.claims.UserID, claims.UserID)
		})
	}
}

func (s *authSuite) TestUnregisteredProcedure() {
	const procedure = "/api.v1.UnregisteredService/Method"

	var reached bool
	mux := http.NewServeMux()
	mux.Handle(procedure, connect.NewUnaryHandler(
		procedure,
		func(_ context.Context, _ *connect.Request[apiv1.LoginRequest]) (*connect.Response[apiv1.LoginResponse], error) {
			reached = true
			return connect.NewResponse(&apiv1.LoginResponse{}), nil
		},
		connect.WithInterceptors(s.interceptor),
	))

	server := httptest.NewServer(mux)
	s.T().Cleanup(server.Close)

	client := connect.NewClient[apiv1.LoginRequest, apiv1.LoginResponse](server.Client(), server.URL+procedure)
	_, err := client.CallUnary(s.T().Context(), connect.NewRequest(&apiv1.LoginRequest{}))
	s.Require().Error(err)
	s.Require().Equal(connect.CodeUnauthenticated, connect.CodeOf(err))
	s.Require().False(reached)
}

func (s *authSuite) TestSchemaDecidesAuthentication() {
	type test struct {
		name     string
		token    string
		expected connect.Code
		call     func(ctx context.Context, client apiv1connect.AuthServiceClient, header http.Header) connect.Code
	}

	accessToken, accessTokenErr := s.jwt.CreateToken(uuid.NewString(), jwt.TokenTypeAccess)
	s.Require().NoError(accessTokenErr)

	login := func(ctx context.Context, client apiv1connect.AuthServiceClient, header http.Header) connect.Code {
		req := connect.NewRequest(&apiv1.LoginRequest{})
		maps.Copy(req.Header(), header)
		_, err := client.Login(ctx, req)
		return connect.CodeOf(err)
	}

	deleteAccount := func(ctx context.Context, client apiv1connect.AuthServiceClient, header http.Header) connect.Code {
		req := connect.NewRequest(&apiv1.DeleteAccountRequest{})
		maps.Copy(req.Header(), header)
		_, err := client.DeleteAccount(ctx, req)
		return connect.CodeOf(err)
	}

	tests := []test{
		{
			name: "ok_public_procedure_reaches_handler",
			call: login,
			// The mounted handler is unimplemented, so its code proves the call reached it.
			expected: connect.CodeUnimplemented,
		},
		{
			name:     "err_authenticated_procedure_without_token",
			call:     deleteAccount,
			expected: connect.CodeUnauthenticated,
		},
		{
			name:     "ok_authenticated_procedure_with_token",
			call:     deleteAccount,
			token:    accessToken,
			expected: connect.CodeUnimplemented,
		},
	}

	mux := http.NewServeMux()
	mux.Handle(apiv1connect.NewAuthServiceHandler(
		apiv1connect.UnimplementedAuthServiceHandler{},
		connect.WithInterceptors(s.interceptor),
	))

	server := httptest.NewServer(mux)
	s.T().Cleanup(server.Close)

	for _, t := range tests {
		s.Run(t.name, func() {
			header := make(http.Header)
			if t.token != "" {
				header.Set("Authorization", fmt.Sprintf("Bearer %s", t.token))
			}

			client := apiv1connect.NewAuthServiceClient(server.Client(), server.URL)
			s.Require().Equal(t.expected, t.call(s.T().Context(), client, header))
		})
	}
}
