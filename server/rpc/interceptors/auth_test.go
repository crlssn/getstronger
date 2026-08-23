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
	"google.golang.org/protobuf/reflect/protoreflect"

	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/rpc/interceptors"
	"github.com/crlssn/getstronger/server/xcontext"
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

// TestGuestProceduresAreTheOnlyOnesServed calls every procedure the app mounts
// without a token and asserts that exactly the guest-marked ones are served.
// Six of the seven services carry no access annotation at all, so this is also
// what pins the default: a method that says nothing needs a token, and so does
// every method of a service mounted without a single annotation.
func (s *authSuite) TestGuestProceduresAreTheOnlyOnesServed() {
	// The schema decides which procedures are guest ones; this list repeats it
	// so that marking one has to be written down twice. Drift fails the sweep
	// below rather than opening an endpoint quietly.
	guestProcedures := []string{
		"/api.v1.AuthService/Signup",
		"/api.v1.AuthService/Login",
		"/api.v1.AuthService/RefreshToken",
		"/api.v1.AuthService/Logout",
		"/api.v1.AuthService/VerifyEmail",
		"/api.v1.AuthService/ResendVerificationEmail",
		"/api.v1.AuthService/ResetPassword",
		"/api.v1.AuthService/UpdatePassword",
	}

	opts := connect.WithInterceptors(s.interceptor)

	mux := http.NewServeMux()
	mux.Handle(apiv1connect.NewAuthServiceHandler(apiv1connect.UnimplementedAuthServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewFeedServiceHandler(apiv1connect.UnimplementedFeedServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewUserServiceHandler(apiv1connect.UnimplementedUserServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewRoutineServiceHandler(apiv1connect.UnimplementedRoutineServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewWorkoutServiceHandler(apiv1connect.UnimplementedWorkoutServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewExerciseServiceHandler(apiv1connect.UnimplementedExerciseServiceHandler{}, opts))
	mux.Handle(apiv1connect.NewNotificationServiceHandler(apiv1connect.UnimplementedNotificationServiceHandler{}, opts))

	server := httptest.NewServer(mux)
	s.T().Cleanup(server.Close)

	files := []protoreflect.FileDescriptor{
		apiv1.File_api_v1_auth_service_proto,
		apiv1.File_api_v1_feed_service_proto,
		apiv1.File_api_v1_user_service_proto,
		apiv1.File_api_v1_routine_service_proto,
		apiv1.File_api_v1_workout_service_proto,
		apiv1.File_api_v1_exercise_service_proto,
		apiv1.File_api_v1_notification_service_proto,
	}

	var served []string
	for _, file := range files {
		services := file.Services()
		for i := range services.Len() {
			service := services.Get(i)
			methods := service.Methods()
			for j := range methods.Len() {
				procedure := fmt.Sprintf("/%s/%s", service.FullName(), methods.Get(j).Name())
				// An empty message encodes to an empty body, which every
				// procedure decodes, so one request type calls them all.
				client := connect.NewClient[apiv1.LoginRequest, apiv1.LoginResponse](server.Client(), server.URL+procedure)
				_, err := client.CallUnary(s.T().Context(), connect.NewRequest(&apiv1.LoginRequest{}))
				s.Require().Error(err)

				if connect.CodeOf(err) == connect.CodeUnauthenticated {
					continue
				}

				// The mounted handler is unimplemented, so its code proves the call reached it.
				s.Require().Equal(connect.CodeUnimplemented, connect.CodeOf(err), procedure)
				served = append(served, procedure)
			}
		}
	}

	s.Require().ElementsMatch(guestProcedures, served)
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
			name: "ok_guest_procedure_reaches_handler",
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

// streamingConn is the smallest connect.StreamingHandlerConn the interceptor
// needs: it reads the spec and the request header and touches nothing else.
type streamingConn struct {
	spec   connect.Spec
	header http.Header
}

func (c *streamingConn) Spec() connect.Spec           { return c.spec }
func (c *streamingConn) Peer() connect.Peer           { return connect.Peer{} }
func (c *streamingConn) Receive(_ any) error          { return nil }
func (c *streamingConn) RequestHeader() http.Header   { return c.header }
func (c *streamingConn) Send(_ any) error             { return nil }
func (c *streamingConn) ResponseHeader() http.Header  { return make(http.Header) }
func (c *streamingConn) ResponseTrailer() http.Header { return make(http.Header) }

func (s *authSuite) TestStreamingHandler() {
	type expected struct {
		code    connect.Code
		reached bool
		userID  string
	}

	type test struct {
		name     string
		token    string
		method   string
		expected expected
	}

	userID := uuid.NewString()
	accessToken, accessTokenErr := s.jwt.CreateToken(userID, jwt.TokenTypeAccess)
	s.Require().NoError(accessTokenErr)

	tests := []test{
		{
			name:   "ok_guest_procedure_reaches_handler",
			method: "Login",
			expected: expected{
				reached: true,
			},
		},
		{
			name:   "err_authenticated_procedure_without_token",
			method: "DeleteAccount",
			expected: expected{
				code: connect.CodeUnauthenticated,
			},
		},
		{
			name:   "ok_authenticated_procedure_with_token",
			method: "DeleteAccount",
			token:  accessToken,
			expected: expected{
				reached: true,
				userID:  userID,
			},
		},
		{
			// A procedure the interceptor cannot read a schema for is refused
			// rather than served: the zero value must not decide.
			name: "err_procedure_without_schema",
			expected: expected{
				code: connect.CodeUnauthenticated,
			},
		},
	}

	service := apiv1.File_api_v1_auth_service_proto.Services().ByName("AuthService")

	for _, t := range tests {
		s.Run(t.name, func() {
			spec := connect.Spec{
				Procedure:  "/api.v1.AuthService/Unknown",
				StreamType: connect.StreamTypeServer,
			}
			if t.method != "" {
				method := service.Methods().ByName(protoreflect.Name(t.method))
				s.Require().NotNil(method)
				spec.Procedure = fmt.Sprintf("/api.v1.AuthService/%s", t.method)
				spec.Schema = method
			}

			header := make(http.Header)
			if t.token != "" {
				header.Set("Authorization", fmt.Sprintf("Bearer %s", t.token))
			}

			var reached bool
			var handlerUserID string
			err := s.interceptor.WrapStreamingHandler(func(ctx context.Context, _ connect.StreamingHandlerConn) error {
				reached = true
				handlerUserID, _ = xcontext.ExtractUserID(ctx)
				return nil
			})(s.T().Context(), &streamingConn{spec: spec, header: header})

			s.Require().Equal(t.expected.reached, reached)
			s.Require().Equal(t.expected.userID, handlerUserID)
			if t.expected.code != 0 {
				s.Require().Error(err)
				s.Require().Equal(t.expected.code, connect.CodeOf(err))
				return
			}
			s.Require().NoError(err)
		})
	}
}
