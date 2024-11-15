package interceptors

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"
	"go.uber.org/zap"

	"github.com/crlssn/getstronger/go/pkg/jwt"
)

type authSuite struct {
	suite.Suite

	jwt         *jwt.Manager
	interceptor *auth
}

func TestAuthSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(authSuite))
}

func (s *authSuite) SetupSuite() {
	s.jwt = jwt.NewManager([]byte("access-token"), []byte("refresh-token"))

	interceptor, ok := NewAuth(zap.NewExample(), s.jwt).(*auth)
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
				err:    errMissingAuthorizationToken,
				claims: nil,
			},
		},
		{
			name: "err_invalid_authorization_token",
			header: map[string][]string{
				"Authorization": {accessToken},
			},
			expected: expected{
				err:    errInvalidAuthorizationToken,
				claims: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			claims, err := s.interceptor.claimsFromHeader(t.header)
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
