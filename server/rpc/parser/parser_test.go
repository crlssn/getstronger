package parser_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/crlssn/getstronger/server/gen/orm"
	"github.com/crlssn/getstronger/server/rpc/parser"
	"github.com/crlssn/getstronger/server/testing/container"
	"github.com/crlssn/getstronger/server/testing/factory"
)

type parserSuite struct {
	suite.Suite

	factory *factory.Factory
}

func TestParserSuite(t *testing.T) {
	t.Parallel()
	suite.Run(t, new(parserSuite))
}

func (s *parserSuite) SetupSuite() {
	ctx := context.Background()
	c := container.NewContainer(ctx)
	s.factory = factory.NewFactory(c.DB)

	s.T().Cleanup(func() {
		if err := c.Terminate(ctx); err != nil {
			s.T().Fatal(fmt.Errorf("failed to terminate container: %w", err))
		}
	})
}

func (s *parserSuite) TestExercise() {
	exercise := s.factory.NewExercise()
	parsed := parser.Exercise(exercise)

	s.Require().Equal(exercise.ID, parsed.Id)
	s.Require().Equal(exercise.UserID, parsed.UserId)
	s.Require().Equal(exercise.Title, parsed.Name)
	s.Require().Equal(exercise.SubTitle.String, parsed.Label)
}

func (s *parserSuite) TestExerciseSlice() {
	exercises := orm.ExerciseSlice{s.factory.NewExercise(), s.factory.NewExercise()}
	parsed := parser.ExerciseSlice(exercises)

	s.Require().Len(parsed, len(exercises))
	for i, exercise := range exercises {
		s.Require().Equal(exercise.ID, parsed[i].Id)
		s.Require().Equal(exercise.UserID, parsed[i].UserId)
		s.Require().Equal(exercise.Title, parsed[i].Name)
		s.Require().Equal(exercise.SubTitle.String, parsed[i].Label)
	}
}

func (s *parserSuite) TestUser() {
	user := s.factory.NewUser()
	parsed := parser.User(user)

	s.Require().Equal(user.ID, parsed.Id)
	s.Require().Equal(user.FirstName, parsed.FirstName)
	s.Require().Equal(user.LastName, parsed.LastName)
	s.Require().False(parsed.Followed)
	s.Require().Empty(parsed.Email)

	auth := s.factory.NewAuth()
	parsed = parser.User(user, parser.UserEmail(auth))
	s.Require().Equal(auth.Email, parsed.Email)

	parsed = parser.User(user, parser.UserFollowed(true))
	s.Require().True(parsed.Followed)
}

func (s *parserSuite) TestUserSlice() {
	users := orm.UserSlice{s.factory.NewUser(), s.factory.NewUser()}
	parsed := parser.UserSlice(users)

	s.Require().Len(parsed, len(users))
	for i, user := range users {
		s.Require().Equal(user.ID, parsed[i].Id)
		s.Require().Equal(user.FirstName, parsed[i].FirstName)
		s.Require().Equal(user.LastName, parsed[i].LastName)
		s.Require().False(parsed[i].Followed)
		s.Require().Empty(parsed[i].Email)
	}
}
