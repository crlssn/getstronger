package repo

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/suite"
	"github.com/volatiletech/null/v8"

	"github.com/crlssn/getstronger/go/pkg/db"
)

type repoSuite struct {
	suite.Suite

	repo *Repo
}

func TestAuthSuite(t *testing.T) {
	suite.Run(t, new(repoSuite))
}

func (s *repoSuite) SetupSuite() {
	s.repo = New(db.MustNewTest())
}

func (s *repoSuite) TestListExercises() {
	type expected struct {
		err error
	}

	type test struct {
		name     string
		expected expected
		req      ListExercisesParams
	}

	tests := []test{
		{
			name: "ok_valid_access_token",
			req: ListExercisesParams{
				UserID:    "ba87305f-aa1f-4111-8253-d4429192aa7a",
				Name:      null.String{},
				Limit:     20,
				PageToken: nil,
			},
			expected: expected{
				err: nil,
			},
		},
	}

	for _, t := range tests {
		s.Run(t.name, func() {
			exercises, nextPageToken, err := s.repo.ListExercises(context.Background(), t.req)
			s.Require().NoError(err)
			//asd := exercises[len(exercises)-1].CreatedAt
			//spew.Dump(exercises, nextPageToken, err)

			var pt pageToken
			s.Require().NoError(json.Unmarshal(nextPageToken, &pt))
			s.Require().Equal(exercises[len(exercises)-1].CreatedAt, pt.CreatedAt)
			s.Require().Len(exercises, t.req.Limit)

			exercises, nextPageToken, err = s.repo.ListExercises(context.Background(), ListExercisesParams{
				UserID:    t.req.UserID,
				Name:      t.req.Name,
				Limit:     t.req.Limit,
				PageToken: nextPageToken,
			})
			s.Require().Nil(nextPageToken)
			s.Require().Len(exercises, 2)

			//if t.expected.err == nil {
			//	s.Require().Nil(err)
			//	return
			//}
			//s.Require().NotNil(err)
			//s.Require().Equal(t.expected.err, err)
		})
	}
}
