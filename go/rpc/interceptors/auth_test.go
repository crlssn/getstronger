package interceptors

import (
	"errors"
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
	suite.Run(t, new(authSuite))
}

func (s *authSuite) SetupSuite() {
	s.jwt = jwt.NewManager([]byte("access-token"), []byte("refresh-token"))
	s.interceptor = NewAuth(zap.NewExample(), s.jwt).(*auth)
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
				err:    errors.New("authorization token is missing"),
				claims: nil,
			},
		},
		{
			name: "err_invalid_authorization_token",
			header: map[string][]string{
				"Authorization": {accessToken},
			},
			expected: expected{
				err:    errors.New("invalid authorization header format"),
				claims: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			claims, err := s.interceptor.claimsFromHeader(t.header)
			if t.expected.err != nil {
				s.Require().Nil(claims)
				s.Require().NotNil(err)
				s.Require().Equal(t.expected.err, err)
				return
			}
			s.Require().Nil(err)
			s.Require().NotNil(claims)
			s.Require().Equal(t.expected.claims.UserID, claims.UserID)
		})
	}
}
