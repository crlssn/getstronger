package interceptors

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"github.com/gofrs/uuid/v5"
	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/types/descriptorpb"

	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/email"
	apiv1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/repo"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

func TestAuthRateLimitRPC(t *testing.T) {
	t.Parallel()
	ctx := t.Context()
	c := container.NewContainer(ctx)
	t.Cleanup(func() { require.NoError(t, c.Terminate(context.Background())) })
	f := factory.NewFactory(c.DB)
	known := f.NewAuth(factory.AuthEmail("known@example.test"), factory.AuthEmailVerified())
	f.NewUser(factory.UserAuthID(known.ID))
	other := f.NewAuth(factory.AuthEmail("other@example.test"), factory.AuthEmailVerified())
	f.NewUser(factory.UserAuthID(other.ID))
	policy := &config.AuthRateLimit{SourceAttempts: 120, SourceWindow: time.Minute, AccountAttempts: 2, AccountWindow: time.Minute}
	first := authLimitServer(t, c.DB, policy, "192.0.2.1:1234")
	second := authLimitServer(t, c.DB, policy, "192.0.2.2:5678")
	clients := []apiv1connect.AuthServiceClient{
		apiv1connect.NewAuthServiceClient(first.Client(), first.URL),
		apiv1connect.NewAuthServiceClient(second.Client(), second.URL),
	}
	login := func(client apiv1connect.AuthServiceClient, address, password string) error {
		_, err := client.Login(ctx, connect.NewRequest(&apiv1.LoginRequest{Email: address, Password: password}))
		if err != nil {
			return fmt.Errorf("test login: %w", err)
		}
		return nil
	}
	refusals := make([]string, 0, 2)
	for _, address := range []string{"known@example.test", "unknown@example.test"} {
		require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(login(clients[0], address, "wrong")))
		require.Equal(t, connect.CodeInvalidArgument, connect.CodeOf(login(clients[1], strings.ToUpper(address), "wrong")))
		err := login(clients[0], address, "wrong")
		require.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
		refusals = append(refusals, err.Error())
	}
	require.Equal(t, refusals[0], refusals[1], "known and unknown accounts have the same refusal")
	require.NoError(t, login(clients[0], "other@example.test", "password"), "a neighbour behind the NAT can still sign in")
	_, err := c.DB.ExecContext(ctx, "UPDATE auth_rate_limits SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'")
	require.NoError(t, err)
	require.NoError(t, login(clients[1], "known@example.test", "password"))

	t.Run("password update follows the account across token rotation", func(t *testing.T) {
		token := uuid.Must(uuid.NewV4())
		_, err := c.DB.ExecContext(ctx, "UPDATE auth SET password_reset_token = $1, password_reset_token_valid_until = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id = $2", token, known.ID)
		require.NoError(t, err)
		for n := range 2 {
			_, err := clients[n].UpdatePassword(ctx, connect.NewRequest(&apiv1.UpdatePasswordRequest{Token: token.String(), Password: "newpassword", PasswordConfirmation: "newpassword"}))
			require.Equal(t, connect.CodeFailedPrecondition, connect.CodeOf(err))
		}
		token = uuid.Must(uuid.NewV4())
		_, err = c.DB.ExecContext(ctx, "UPDATE auth SET password_reset_token = $1, password_reset_token_valid_until = CURRENT_TIMESTAMP + INTERVAL '1 hour' WHERE id = $2", token, known.ID)
		require.NoError(t, err)
		_, err = clients[1].UpdatePassword(ctx, connect.NewRequest(&apiv1.UpdatePasswordRequest{Token: token.String(), Password: "newpassword", PasswordConfirmation: "newpassword"}))
		require.Equal(t, connect.CodeResourceExhausted, connect.CodeOf(err))
	})

	t.Run("every schema guest consumes source budget before validation", func(t *testing.T) {
		methods := apiv1.File_api_v1_auth_service_proto.Services().ByName("AuthService").Methods()
		for n := range methods.Len() {
			method := methods.Get(n)
			options, ok := method.Options().(*descriptorpb.MethodOptions)
			require.True(t, ok)
			guest, ok := proto.GetExtension(options, apiv1.E_Guest).(bool)
			require.True(t, ok)
			if !guest {
				continue
			}
			t.Run(string(method.Name()), func(t *testing.T) {
				_, err := c.DB.ExecContext(ctx, "DELETE FROM auth_rate_limits")
				require.NoError(t, err)
				server := authLimitServer(t, c.DB, &config.AuthRateLimit{SourceAttempts: 1, SourceWindow: time.Minute, AccountAttempts: 2, AccountWindow: time.Minute}, "192.0.2.3:1234")
				for attempt := range 2 {
					request, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/api.v1.AuthService/"+string(method.Name()), strings.NewReader("{}"))
					require.NoError(t, err)
					request.Header.Set("Content-Type", "application/json")
					response, err := server.Client().Do(request)
					require.NoError(t, err)
					require.NoError(t, response.Body.Close())
					if attempt == 0 {
						require.NotEqual(t, http.StatusTooManyRequests, response.StatusCode)
					} else {
						require.Equal(t, http.StatusTooManyRequests, response.StatusCode)
					}
				}
			})
		}
	})
}

func authLimitServer(t *testing.T, db *sql.DB, policy *config.AuthRateLimit, peer string) *httptest.Server {
	t.Helper()
	log := zap.NewNop()
	cfg := &config.Config{JWT: config.JWT{AccessTokenKey: "test-key"}}
	issuer := jwt.NewIssuer([]byte("test-key"), []byte("refresh-key"))
	store := repo.New(db)
	validator, err := protovalidate.New()
	require.NoError(t, err)
	_, handler := apiv1connect.NewAuthServiceHandler(handlers.NewAuthHandler(handlers.AuthHandlerParams{
		Repo: store, JWT: issuer, Email: email.NewNoop(), Cookies: cookies.New(cfg),
	}), provideHandlerOptions(NewAuth(log, issuer), newAuthRateLimit(log, store, cfg, policy), newValidator(log, validator))...)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.RemoteAddr = peer
		handler.ServeHTTP(w, r)
	}))
	t.Cleanup(server.Close)
	return server
}

type failingAuthAttempts struct {
	err   error
	calls int
}

func (f *failingAuthAttempts) ConsumeAuthAttempt(context.Context, string, int, time.Duration) (bool, error) {
	f.calls++
	return false, f.err
}

func (f *failingAuthAttempts) PasswordResetAccount(context.Context, uuid.UUID) (uuid.UUID, error) {
	return uuid.Nil, sql.ErrNoRows
}

var errTestAuthStorage = errors.New("database private detail")

func TestAuthRateLimitFailureAndAuthenticatedBypass(t *testing.T) {
	t.Parallel()
	for _, tc := range []struct {
		err  error
		code connect.Code
	}{
		{errTestAuthStorage, connect.CodeUnavailable},
		{context.Canceled, connect.CodeCanceled},
		{context.DeadlineExceeded, connect.CodeDeadlineExceeded},
	} {
		t.Run(tc.code.String(), func(t *testing.T) {
			store := &failingAuthAttempts{err: tc.err}
			limit := &authRateLimit{log: zap.NewNop(), store: store, policy: &config.AuthRateLimit{SourceAttempts: 1, SourceWindow: time.Minute}, key: []byte("test")}
			methods := apiv1.File_api_v1_auth_service_proto.Services().ByName("AuthService").Methods()
			var reached int
			next := func(context.Context, *connect.Request[apiv1.LoginRequest]) (*connect.Response[apiv1.LoginResponse], error) {
				reached++
				return connect.NewResponse(&apiv1.LoginResponse{}), nil
			}
			for _, name := range []string{"Login", "DeleteAccount"} {
				schema := methods.ByName(protoreflect.Name(name))
				handler := connect.NewUnaryHandler("/api.v1.AuthService/"+name, next, connect.WithSchema(schema), connect.WithInterceptors(limit))
				recorder := httptest.NewRecorder()
				request := httptest.NewRequestWithContext(t.Context(), http.MethodPost, "/api.v1.AuthService/"+name, strings.NewReader("{}"))
				request.Header.Set("Content-Type", "application/json")
				handler.ServeHTTP(recorder, request)
				if name == "Login" {
					require.Contains(t, recorder.Body.String(), tc.code.String())
					require.NotContains(t, recorder.Body.String(), "private detail")
					require.Zero(t, reached)
				} else {
					require.Equal(t, http.StatusOK, recorder.Code)
					require.Equal(t, 1, reached)
				}
			}
			require.Equal(t, 1, store.calls, "authenticated procedures never touch the limiter store")
		})
	}
}

// budgetedAuthAttempts allows a fixed number of reservations, then refuses.
type budgetedAuthAttempts struct {
	remaining int
	calls     int
}

func (b *budgetedAuthAttempts) ConsumeAuthAttempt(context.Context, string, int, time.Duration) (bool, error) {
	b.calls++
	if b.remaining == 0 {
		return false, nil
	}
	b.remaining--
	return true, nil
}

func (b *budgetedAuthAttempts) PasswordResetAccount(context.Context, uuid.UUID) (uuid.UUID, error) {
	return uuid.Nil, sql.ErrNoRows
}

// rateLimitStreamingConn is the smallest connect.StreamingHandlerConn the
// interceptor needs: it reads the spec, the peer and the request header.
type rateLimitStreamingConn struct {
	spec   connect.Spec
	header http.Header
}

func (c *rateLimitStreamingConn) Spec() connect.Spec           { return c.spec }
func (c *rateLimitStreamingConn) Peer() connect.Peer           { return connect.Peer{Addr: "192.0.2.1:1234"} }
func (c *rateLimitStreamingConn) Receive(any) error            { return nil }
func (c *rateLimitStreamingConn) RequestHeader() http.Header   { return c.header }
func (c *rateLimitStreamingConn) Send(any) error               { return nil }
func (c *rateLimitStreamingConn) ResponseHeader() http.Header  { return make(http.Header) }
func (c *rateLimitStreamingConn) ResponseTrailer() http.Header { return make(http.Header) }

// A stream opens on the same budget as a unary call: until its token is read an
// SSE connection is another way to spend a guest procedure's source allowance.
func TestAuthRateLimitStreamingHandler(t *testing.T) {
	t.Parallel()
	methods := apiv1.File_api_v1_auth_service_proto.Services().ByName("AuthService").Methods()
	spec := func(name string) connect.Spec {
		return connect.Spec{
			Procedure:  "/api.v1.AuthService/" + name,
			StreamType: connect.StreamTypeServer,
			Schema:     methods.ByName(protoreflect.Name(name)),
		}
	}

	for _, tc := range []struct {
		name    string
		spec    connect.Spec
		budget  int
		reached bool
		code    connect.Code
		calls   int
	}{
		{"guest within budget", spec("Login"), 1, true, 0, 1},
		{"guest over budget", spec("Login"), 0, false, connect.CodeResourceExhausted, 1},
		{"authenticated bypass", spec("DeleteAccount"), 0, true, 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			store := &budgetedAuthAttempts{remaining: tc.budget}
			limit := &authRateLimit{
				log:    zap.NewNop(),
				store:  store,
				policy: &config.AuthRateLimit{SourceAttempts: 1, SourceWindow: time.Minute},
				key:    []byte("test"),
			}

			var reached bool
			err := limit.WrapStreamingHandler(func(context.Context, connect.StreamingHandlerConn) error {
				reached = true
				return nil
			})(t.Context(), &rateLimitStreamingConn{spec: tc.spec, header: make(http.Header)})

			require.Equal(t, tc.reached, reached)
			require.Equal(t, tc.calls, store.calls, "authenticated procedures never touch the limiter store")
			if tc.code != 0 {
				require.Equal(t, tc.code, connect.CodeOf(err))
				return
			}
			require.NoError(t, err)
		})
	}
}

// The client half limits nothing: it is the outbound side of a duplex the API
// does not serve, so it hands the call straight on.
func TestAuthRateLimitStreamingClientPassesThrough(t *testing.T) {
	t.Parallel()
	limit := &authRateLimit{
		log:    zap.NewNop(),
		store:  &budgetedAuthAttempts{},
		policy: &config.AuthRateLimit{},
		key:    []byte("test"),
	}

	called := false
	wrapped := limit.WrapStreamingClient(func(context.Context, connect.Spec) connect.StreamingClientConn {
		called = true
		return nil
	})

	require.Nil(t, wrapped(t.Context(), connect.Spec{}))
	require.True(t, called)
}
