package v1_test

import (
	"context"
	"log"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/brianvoe/gofakeit/v7"
	"github.com/google/uuid"
	"github.com/stephenafamo/bob"
	"github.com/stretchr/testify/suite"
	"go.uber.org/mock/gomock"
	"go.uber.org/zap"
	"golang.org/x/crypto/bcrypt"

	"github.com/crlssn/getstronger/server/account"
	"github.com/crlssn/getstronger/server/config"
	"github.com/crlssn/getstronger/server/cookies"
	"github.com/crlssn/getstronger/server/email"

	"github.com/crlssn/getstronger/server/gen/models"
	v1 "github.com/crlssn/getstronger/server/gen/proto/api/v1"
	"github.com/crlssn/getstronger/server/gen/proto/api/v1/apiv1connect"
	"github.com/crlssn/getstronger/server/jwt"
	"github.com/crlssn/getstronger/server/repo"
	"github.com/crlssn/getstronger/server/rpc"
	handlers "github.com/crlssn/getstronger/server/rpc/handlers/v1"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
	"github.com/crlssn/getstronger/server/xcontext"
)

type authSuite struct {
	suite.Suite

	jwt     *jwt.Issuer
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
	s.jwt = jwt.NewIssuer([]byte("access-key"), []byte("refresh-key"))
	s.handler = handlers.NewAuthHandler(handlers.AuthHandlerParams{
		JWT:     s.jwt,
		Repo:    repo.New(s.container.DB),
		Email:   s.mocks.email,
		Cookies: cookies.New(new(config.Config)),
	})

	s.T().Cleanup(func() {
		s.mocks.controller.Finish()
		if err := s.container.Terminate(ctx); err != nil {
			log.Fatalf("Clean container: %s", err)
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
			name: "ok_signed_up",
			req: &connect.Request[v1.SignupRequest]{
				Msg: &v1.SignupRequest{
					Email:                gofakeit.Email(),
					Password:             "password",
					PasswordConfirmation: "password",
					Name:                 gofakeit.Name(),
					Username:             "Signup.Handle",
				},
			},
			init: func(t test) {
				s.mocks.email.EXPECT().
					SendVerification(gomock.Any(), gomock.Any()).
					Do(func(_ context.Context, req email.SendVerification) {
						s.Require().Equal(t.req.Msg.GetEmail(), req.Email)
						s.Require().Equal(t.req.Msg.GetName(), req.Name)
						_, err := uuid.Parse(req.Token)
						s.Require().NoError(err)
					})
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_username_taken_case_insensitively",
			req: &connect.Request[v1.SignupRequest]{
				Msg: &v1.SignupRequest{
					Email:                gofakeit.Email(),
					Password:             "password",
					PasswordConfirmation: "password",
					Name:                 gofakeit.Name(),
					Username:             "Duplicate.Handle",
				},
			},
			init: func(_ test) {
				s.factory.NewUser(factory.UserUsername("duplicate.handle"))
				s.mocks.email.EXPECT().SendVerification(gomock.Any(), gomock.Any()).Times(0)
			},
			expected: expected{
				err: rpc.Error(connect.CodeAlreadyExists, v1.Error_ERROR_USERNAME_TAKEN),
			},
		},
		{
			name: "err_password_mismatch",
			req: &connect.Request[v1.SignupRequest]{
				Msg: &v1.SignupRequest{
					Email:                gofakeit.Email(),
					Password:             "pass",
					PasswordConfirmation: "password",
					Name:                 gofakeit.Name(),
				},
			},
			init: func(_ test) {
				s.mocks.email.EXPECT().SendVerification(gomock.Any(), gomock.Any()).Times(0)
			},
			expected: expected{
				err: rpc.Error(connect.CodeInvalidArgument, v1.Error_ERROR_PASSWORDS_DO_NOT_MATCH),
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
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			auth, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(t.req.Msg.GetEmail())).One(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(auth.EmailVerified)

			// The signup email counts towards the resend rate limit.
			s.Require().False(auth.EmailVerificationSentAt.IsNull())

			user, err := auth.User().One(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(err)

			s.Require().Equal(t.req.Msg.GetName(), user.Name)
			// The username is stored lowercased so uniqueness holds regardless
			// of how it was typed.
			s.Require().Equal("signup.handle", user.Username)
			// Signup no longer asks for units: a new account starts metric.
			s.Require().Equal("kg", user.WeightUnit)
			s.Require().Equal("km", user.DistanceUnit)
		})
	}
}

func (s *authSuite) TestLogin() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.LoginRequest]
		init     func(t test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_logged_in",
			req: &connect.Request[v1.LoginRequest]{
				Msg: &v1.LoginRequest{
					Email:    gofakeit.Email(),
					Password: "password",
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
					factory.AuthPassword(t.req.Msg.GetPassword()),
					factory.AuthEmailVerified(),
				)
				s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_invalid_credentials",
			req: &connect.Request[v1.LoginRequest]{
				Msg: &v1.LoginRequest{
					Email:    gofakeit.Email(),
					Password: "password",
				},
			},
			init: func(_ test) {},
			expected: expected{
				err: connect.NewError(connect.CodeInvalidArgument, handlers.ErrInvalidCredentials),
			},
		},
		{
			name: "err_email_not_verified",
			req: &connect.Request[v1.LoginRequest]{
				Msg: &v1.LoginRequest{
					Email:    gofakeit.Email(),
					Password: "password",
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
					factory.AuthPassword(t.req.Msg.GetPassword()),
				)
				s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)
			},
			expected: expected{
				err: rpc.Error(connect.CodeFailedPrecondition, v1.Error_ERROR_EMAIL_NOT_VERIFIED),
			},
		},
	}

	ctx := xcontext.WithLogger(context.Background(), zap.NewExample())

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			res, err := s.handler.Login(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)
			s.Require().NotEmpty(res.Msg.GetAccessToken())

			auth, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(t.req.Msg.GetEmail())).One(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(auth.RefreshToken.IsNull())
		})
	}
}

func (s *authSuite) TestRefreshToken() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		token    string
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name:  "ok_token_refreshed",
			token: s.jwt.MustCreateToken(uuid.NewString(), jwt.TokenTypeRefresh),
			init: func(t test) context.Context {
				s.factory.NewAuth(factory.AuthRefreshToken(t.token))
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithRefreshToken(ctx, t.token)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:  "err_token_not_found",
			token: s.jwt.MustCreateToken(uuid.NewString(), jwt.TokenTypeRefresh),
			init: func(t test) context.Context {
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithRefreshToken(ctx, t.token)
			},
			expected: expected{
				err: connect.NewError(connect.CodeUnauthenticated, handlers.ErrRefreshTokenNotFound),
			},
		},
		{
			name:  "err_access_token_provided",
			token: s.jwt.MustCreateToken(uuid.NewString(), jwt.TokenTypeAccess),
			init: func(t test) context.Context {
				s.factory.NewAuth(factory.AuthRefreshToken(t.token))
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithRefreshToken(ctx, t.token)
			},
			expected: expected{
				err: connect.NewError(connect.CodeInvalidArgument, handlers.ErrInvalidRefreshToken),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.RefreshToken(ctx, &connect.Request[v1.RefreshTokenRequest]{
				Msg: &v1.RefreshTokenRequest{},
			})
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)
			s.Require().NotEmpty(res.Msg.GetAccessToken())
		})
	}
}

func (s *authSuite) TestLogout() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		token    string
		init     func(t test) context.Context
		expected expected
	}

	tests := []test{
		{
			name:  "ok_logged_out",
			token: s.jwt.MustCreateToken(uuid.NewString(), jwt.TokenTypeRefresh),
			init: func(t test) context.Context {
				auth := s.factory.NewAuth(factory.AuthRefreshToken(t.token))
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithRefreshToken(ctx, auth.RefreshToken.GetOrZero())
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:  "ok_no_refresh_token",
			token: "",
			init: func(_ test) context.Context {
				return xcontext.WithLogger(context.Background(), zap.NewExample())
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:  "err_refresh_token_not_found",
			token: s.jwt.MustCreateToken(uuid.NewString(), jwt.TokenTypeRefresh),
			init: func(t test) context.Context {
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithRefreshToken(ctx, t.token)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx := t.init(t)

			res, err := s.handler.Logout(ctx, &connect.Request[v1.LogoutRequest]{})
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			cookie := res.Header().Get("Set-Cookie")
			s.Require().Contains(cookie, "HttpOnly")
			s.Require().Contains(cookie, "Max-Age=0")

			exists, existsErr := models.Auths.Query(models.SelectWhere.Auths.RefreshToken.EQ(t.token)).Exists(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(existsErr)
			s.Require().False(exists)
		})
	}
}

func (s *authSuite) TestDeleteAccount() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		password string
		init     func(t test) (context.Context, *models.User)
		expected expected
	}

	const password = "password"

	newAccount := func() *models.User {
		auth := s.factory.NewAuth(factory.AuthPassword(password))
		return s.factory.NewUser(factory.UserAuthID(auth.ID))
	}

	tests := []test{
		{
			name:     "ok_account_deleted",
			password: password,
			init: func(_ test) (context.Context, *models.User) {
				user := newAccount()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID.String()), user
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name:     "err_wrong_password",
			password: "not-the-password",
			init: func(_ test) (context.Context, *models.User) {
				user := newAccount()
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, user.ID.String()), user
			},
			expected: expected{
				err: connect.NewError(connect.CodeUnauthenticated, nil),
			},
		},
		{
			name:     "err_user_not_found",
			password: password,
			init: func(_ test) (context.Context, *models.User) {
				ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
				return xcontext.WithUserID(ctx, uuid.NewString()), nil
			},
			expected: expected{
				err: connect.NewError(connect.CodeNotFound, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			ctx, user := t.init(t)

			res, err := s.handler.DeleteAccount(ctx, &connect.Request[v1.DeleteAccountRequest]{
				Msg: &v1.DeleteAccountRequest{Password: t.password},
			})
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())

				if user != nil {
					// A rejected request must leave the account exactly as it was.
					exists, existsErr := models.Users.Query(models.SelectWhere.Users.ID.EQ(user.ID)).
						Exists(ctx, bob.NewDB(s.container.DB))
					s.Require().NoError(existsErr)
					s.Require().True(exists)
				}
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			// The session dies with the account, so the browser is told to drop
			// the refresh cookie just as it is on logout.
			cookie := res.Header().Get("Set-Cookie")
			s.Require().Contains(cookie, "HttpOnly")
			s.Require().Contains(cookie, "Max-Age=0")

			exists, existsErr := models.Users.Query(models.SelectWhere.Users.ID.EQ(user.ID)).
				Exists(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(existsErr)
			s.Require().False(exists)

			exists, existsErr = models.Auths.Query(models.SelectWhere.Auths.ID.EQ(user.AuthID)).
				Exists(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(existsErr)
			s.Require().False(exists)
		})
	}
}

func (s *authSuite) TestVerifyEmail() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.VerifyEmailRequest]
		init     func(t test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_email_verified",
			req: &connect.Request[v1.VerifyEmailRequest]{
				Msg: &v1.VerifyEmailRequest{
					Token: uuid.NewString(),
				},
			},
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthEmailToken(t.req.Msg.GetToken()),
					factory.AuthEmailVerified(),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_email_token_not_found",
			req: &connect.Request[v1.VerifyEmailRequest]{
				Msg: &v1.VerifyEmailRequest{
					Token: uuid.NewString(),
				},
			},
			init: func(_ test) {},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
			res, err := s.handler.VerifyEmail(ctx, t.req)

			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().NotNil(res)

			auth, err := models.Auths.Query(models.SelectWhere.Auths.EmailToken.EQ(nativeUUID(t.req.Msg.GetToken()))).One(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().True(auth.EmailVerified)
		})
	}
}

func (s *authSuite) TestResendVerificationEmail() {
	type test struct {
		name     string
		req      *connect.Request[v1.ResendVerificationEmailRequest]
		init     func(t test)
		emailled bool
	}

	tests := []test{
		{
			name: "ok_verification_email_resent",
			req: &connect.Request[v1.ResendVerificationEmailRequest]{
				Msg: &v1.ResendVerificationEmailRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
				)
				user := s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)

				s.mocks.email.EXPECT().
					SendVerification(gomock.Any(), gomock.Any()).
					Do(func(_ context.Context, req email.SendVerification) {
						s.Require().Equal(user.Name, req.Name)
						s.Require().Equal(t.req.Msg.GetEmail(), req.Email)
						s.Require().Equal(auth.EmailToken.String(), req.Token)
					})
			},
			emailled: true,
		},
		{
			name: "ok_cooldown_elapsed_verification_email_resent",
			req: &connect.Request[v1.ResendVerificationEmailRequest]{
				Msg: &v1.ResendVerificationEmailRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
					factory.AuthEmailVerificationSentAt(time.Now().UTC().Add(-account.VerificationCooldown-time.Minute)),
				)
				s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)

				s.mocks.email.EXPECT().
					SendVerification(gomock.Any(), gomock.Any())
			},
			emailled: true,
		},
		{
			name: "ok_email_not_found_no_exposure",
			req: &connect.Request[v1.ResendVerificationEmailRequest]{
				Msg: &v1.ResendVerificationEmailRequest{
					Email: gofakeit.Email(),
				},
			},
			init:     func(_ test) {},
			emailled: false,
		},
		{
			name: "ok_email_already_verified_no_exposure",
			req: &connect.Request[v1.ResendVerificationEmailRequest]{
				Msg: &v1.ResendVerificationEmailRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
					factory.AuthEmailVerified(),
				)
				s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)
			},
			emailled: false,
		},
		{
			name: "ok_rate_limited_no_exposure",
			req: &connect.Request[v1.ResendVerificationEmailRequest]{
				Msg: &v1.ResendVerificationEmailRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
					factory.AuthEmailVerificationSentAt(time.Now().UTC()),
				)
				s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)
			},
			emailled: false,
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
			res, err := s.handler.ResendVerificationEmail(ctx, t.req)
			s.Require().NoError(err)

			// The response must be identical for every address so that it never
			// discloses whether an account exists or is already verified.
			s.Require().Equal(&v1.ResendVerificationEmailResponse{
				RetryAfterSeconds: int32(account.VerificationCooldown.Seconds()),
			}, res.Msg)

			if !t.emailled {
				return
			}

			auth, err := models.Auths.Query(models.SelectWhere.Auths.Email.EQ(t.req.Msg.GetEmail())).One(ctx, bob.NewDB(s.container.DB))
			s.Require().NoError(err)
			s.Require().False(auth.EmailVerificationSentAt.IsNull())
			s.Require().WithinDuration(time.Now().UTC(), auth.EmailVerificationSentAt.GetOrZero(), time.Minute)
		})
	}
}

func (s *authSuite) TestResetPassword() {
	type expected struct {
		err  error
		resp *v1.ResetPasswordResponse
	}

	type test struct {
		name     string
		req      *connect.Request[v1.ResetPasswordRequest]
		init     func(t test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_password_reset_email_sent",
			req: &connect.Request[v1.ResetPasswordRequest]{
				Msg: &v1.ResetPasswordRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(t test) {
				auth := s.factory.NewAuth(
					factory.AuthEmail(t.req.Msg.GetEmail()),
				)
				user := s.factory.NewUser(
					factory.UserAuthID(auth.ID),
				)

				s.mocks.email.EXPECT().
					SendPasswordReset(gomock.Any(), gomock.Any()).
					Do(func(_ context.Context, req email.SendPasswordReset) {
						s.Require().Equal(user.Name, req.Name)
						s.Require().Equal(t.req.Msg.GetEmail(), req.Email)
						_, err := uuid.Parse(req.Token)
						s.Require().NoError(err)
					})
			},
			expected: expected{
				err:  nil,
				resp: &v1.ResetPasswordResponse{},
			},
		},
		{
			name: "ok_email_not_found_no_exposure",
			req: &connect.Request[v1.ResetPasswordRequest]{
				Msg: &v1.ResetPasswordRequest{
					Email: gofakeit.Email(),
				},
			},
			init: func(_ test) {},
			expected: expected{
				err:  nil,
				resp: &v1.ResetPasswordResponse{},
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())
			res, err := s.handler.ResetPassword(ctx, t.req)

			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NoError(err)
			s.Require().Equal(t.expected.resp, res.Msg)
		})
	}
}

func (s *authSuite) TestUpdatePassword() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		req      *connect.Request[v1.UpdatePasswordRequest]
		init     func(t test)
		expected expected
	}

	tests := []test{
		{
			name: "ok_password_updated",
			req: &connect.Request[v1.UpdatePasswordRequest]{
				Msg: &v1.UpdatePasswordRequest{
					Token:                uuid.NewString(),
					Password:             "new_password",
					PasswordConfirmation: "new_password",
				},
			},
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthPasswordResetToken(t.req.Msg.GetToken(), account.PasswordResetTokenTTL),
				)
			},
			expected: expected{
				err: nil,
			},
		},
		{
			name: "err_password_mismatch",
			req: &connect.Request[v1.UpdatePasswordRequest]{
				Msg: &v1.UpdatePasswordRequest{
					Token:                uuid.NewString(),
					Password:             "new_password",
					PasswordConfirmation: "different_password",
				},
			},
			init: func(_ test) {},
			expected: expected{
				err: rpc.Error(connect.CodeInvalidArgument, v1.Error_ERROR_PASSWORDS_DO_NOT_MATCH),
			},
		},
		{
			name: "err_token_not_found",
			req: &connect.Request[v1.UpdatePasswordRequest]{
				Msg: &v1.UpdatePasswordRequest{
					Token:                uuid.NewString(),
					Password:             "new_password",
					PasswordConfirmation: "new_password",
				},
			},
			init: func(_ test) {},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
		{
			name: "err_token_expired",
			req: &connect.Request[v1.UpdatePasswordRequest]{
				Msg: &v1.UpdatePasswordRequest{
					Token:                uuid.NewString(),
					Password:             "new_password",
					PasswordConfirmation: "new_password",
				},
			},
			init: func(t test) {
				s.factory.NewAuth(
					factory.AuthPasswordResetToken(t.req.Msg.GetToken(), -time.Hour),
				)
			},
			expected: expected{
				err: connect.NewError(connect.CodeFailedPrecondition, nil),
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			t.init(t)

			ctx := xcontext.WithLogger(context.Background(), zap.NewExample())

			var err error
			var auth *models.Auth
			if t.expected.err == nil {
				auth, err = models.Auths.Query(models.SelectWhere.Auths.PasswordResetToken.EQ(nativeUUID(t.req.Msg.GetToken()))).One(ctx, bob.NewDB(s.container.DB))
				s.Require().NoError(err)
			}

			res, err := s.handler.UpdatePassword(ctx, t.req)
			if t.expected.err != nil {
				s.Require().Nil(res)
				s.Require().Error(err)
				s.Require().Equal(t.expected.err.Error(), err.Error())
				return
			}

			s.Require().NotNil(res)
			s.Require().NoError(err)
			s.Require().NoError(auth.Reload(ctx, bob.NewDB(s.container.DB)))
			s.Require().Empty(auth.PasswordResetToken.GetOrZero())
			s.Require().NoError(bcrypt.CompareHashAndPassword(auth.Password, []byte(t.req.Msg.GetPassword())))
		})
	}
}
